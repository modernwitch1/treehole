import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHmac } from 'crypto';
import type { ConversationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { AppConfig } from '../config/app.config';
import { ModerationService } from '../common/moderation.service';
import { RateLimitService } from '../common/security/rate-limit.service';
import { COMMUNITY_RULES_VERSION } from '../common/community-safety.constants';
import { createSafeMarkdownRenderer } from '../common/safe-markdown';

type ConversationWithRelations = Awaited<ReturnType<MessagesService['findConversationForUser']>>;

@Injectable()
export class MessagesService {
  private readonly markdown = createSafeMarkdownRenderer();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly moderation: ModerationService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async listConversations(userId: bigint, opts?: { cursor?: string }) {
    const pageSize = 50;
    const cursorWhere = opts?.cursor ? { id: { lt: this.parseId(opts.cursor) } } : {};

    const conversations = await this.prisma.conversation.findMany({
      where: {
        OR: [{ initiatorId: userId }, { recipientId: userId }],
        messages: {
          some: {
            OR: [{ senderId: userId }, { status: 'published' }],
          },
        },
        ...cursorWhere,
      },
      orderBy: { lastMessageAt: 'desc' },
      take: pageSize + 1,
      include: {
        originPost: {
          select: {
            id: true,
            title: true,
            board: { select: { name: true } },
          },
        },
        messages: {
          where: { OR: [{ senderId: userId }, { status: 'published' }] },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const hasMore = conversations.length > pageSize;
    const items = conversations.slice(0, pageSize);

    const result = await Promise.all(
      items.map(async (conversation) => {
        const unreadCount = await this.prisma.directMessage.count({
          where: {
            conversationId: conversation.id,
            senderId: { not: userId },
            readAt: null,
            status: 'published',
          },
        });
        return this.toConversation(conversation, userId, unreadCount);
      }),
    );

    return {
      items: result,
      nextCursor: hasMore ? String(items[items.length - 1].id) : undefined,
    };
  }

  async getConversation(id: string, userId: bigint) {
    const conversation = await this.findConversationForUser(id, userId);
    if (!conversation) {
      throw new NotFoundException('会话不存在');
    }

    await this.prisma.directMessage.updateMany({
      where: {
        conversationId: conversation.id,
        senderId: { not: userId },
        readAt: null,
        status: 'published',
      },
      data: { readAt: new Date() },
    });

    const visibleMessages = conversation.messages.filter(
      (message) => message.senderId === userId || message.status === 'published',
    );

    return {
      conversation: this.toConversation(conversation, userId, 0),
      messages: visibleMessages.map((message) => ({
        id: String(message.id),
        conversationId: String(message.conversationId),
        sender: message.senderId === userId ? 'me' : 'partner',
        contentMd: message.contentMd,
        contentHtml: message.contentHtml,
        createdAt: message.createdAt.toISOString(),
        status:
          message.senderId === userId
            ? message.status === 'pending_review'
              ? 'pending_review'
              : message.status === 'hidden' || message.status === 'deleted'
                ? 'not_delivered'
                : message.readAt
                  ? 'read'
                  : 'sent'
            : undefined,
      })),
      canSendMore: this.canSendMore(conversation, userId),
      blockedReason: this.blockedReason(conversation, userId),
    };
  }

  async initiateConversation(
    userId: bigint,
    originPostId: string,
    initialMessage: string,
    rulesAcknowledged: boolean,
    ip?: string,
    userAgent?: string,
  ) {
    await this.rateLimit.consume('initiate-message-user', String(userId), 10, 3600);
    if (!rulesAcknowledged) {
      throw new BadRequestException('请先确认私信同样遵守社区规则');
    }
    const sender = await this.assertCanWrite(userId);
    if (Date.now() - sender.createdAt.getTime() < 7 * 24 * 60 * 60 * 1000) {
      await this.rateLimit.consume(
        'initiate-message-new-user',
        String(userId),
        3,
        3600,
        '新用户保护期内每小时最多发起 3 个陌生会话',
      );
    }
    const rawContent = this.validateContent(initialMessage, 500);
    const moderationContext = {
      surface: 'direct_message' as const,
      authorId: userId,
      ip,
      userAgent,
    };
    const moderated = await this.moderation.moderateOrThrow(rawContent, moderationContext);
    const contentMd = moderated.content;
    const post = await this.prisma.post.findFirst({
      where: { id: this.parseId(originPostId), status: 'published' },
      include: { author: true },
    });
    if (!post) {
      throw new NotFoundException('帖子不存在');
    }
    if (post.authorId === userId) {
      throw new BadRequestException('不能私信自己');
    }
    if (!post.author.dmAllowed) {
      return { ok: false, error: 'partner_dm_disabled' as const };
    }
    if (post.author.status !== 'active') {
      return { ok: false, error: 'blocked' as const, message: '对方账号暂不可用' };
    }
    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: post.authorId },
          { blockerId: post.authorId, blockedId: userId },
        ],
      },
      select: { id: true },
    });
    if (block) {
      return { ok: false, error: 'blocked' as const, message: '无法向该用户发起私信' };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const created = await tx.conversation.create({
        data: {
          initiatorId: userId,
          recipientId: post.authorId,
          originPostId: post.id,
          status: 'pending',
          lastMessageAt: new Date(),
        },
      });
      const message = await tx.directMessage.create({
        data: {
          conversationId: created.id,
          senderId: userId,
          contentMd,
          contentHtml: this.renderMd(contentMd),
          status: moderated.status,
          moderationLabels: this.moderation.moderationLabels(
            moderated,
          ) as unknown as Prisma.InputJsonValue,
          contentHash: moderated.contentHash,
          senderIp: ip && ip !== 'unknown' ? ip : null,
          senderUserAgent: userAgent?.slice(0, 512),
          legalHold: moderated.status === 'pending_review' && moderated.riskLevel >= 4,
        },
      });
      await tx.policyAcceptance.create({
        data: {
          userId,
          policyVersion: COMMUNITY_RULES_VERSION,
          source: 'private_message',
          ip: ip && ip !== 'unknown' ? ip : null,
          userAgent: userAgent?.slice(0, 512),
        },
      });
      return { conversation: created, message };
    });

    if (moderated.status === 'pending_review') {
      await this.moderation.recordCase(moderated, moderationContext, result.message.id, rawContent);
    }

    return {
      ok: true,
      conversationId: String(result.conversation.id),
      moderationStatus: moderated.status,
    };
  }

  async sendMessage(
    id: string,
    userId: bigint,
    content: string,
    rulesAcknowledged: boolean,
    ip?: string,
    userAgent?: string,
  ) {
    await this.rateLimit.consume('direct-message-user', String(userId), 30, 60);
    if (!rulesAcknowledged) {
      throw new BadRequestException('请先确认私信同样遵守社区规则');
    }
    await this.assertCanWrite(userId);
    const rawContent = this.validateContent(content, 1000);
    const moderationContext = {
      surface: 'direct_message' as const,
      authorId: userId,
      ip,
      userAgent,
    };
    const moderated = await this.moderation.moderateOrThrow(rawContent, moderationContext);
    const contentMd = moderated.content;
    const conversation = await this.findConversationForUser(id, userId);
    if (!conversation) {
      throw new NotFoundException('会话不存在');
    }

    const message = await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.conversation.findFirst({
        where: { id: conversation.id },
      });
      if (!fresh || fresh.status === 'blocked') {
        throw new BadRequestException('该会话已封闭');
      }
      if (fresh.status === 'pending' && fresh.initiatorId === userId) {
        throw new BadRequestException('对方回复前只能发送一条消息');
      }

      const created = await tx.directMessage.create({
        data: {
          conversationId: conversation.id,
          senderId: userId,
          contentMd,
          contentHtml: this.renderMd(contentMd),
          status: moderated.status,
          moderationLabels: this.moderation.moderationLabels(
            moderated,
          ) as unknown as Prisma.InputJsonValue,
          contentHash: moderated.contentHash,
          senderIp: ip && ip !== 'unknown' ? ip : null,
          senderUserAgent: userAgent?.slice(0, 512),
          legalHold: moderated.status === 'pending_review' && moderated.riskLevel >= 4,
        },
      });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          status:
            moderated.status === 'published' && fresh.status === 'pending'
              ? 'active'
              : fresh.status,
          ...(moderated.status === 'published' ? { lastMessageAt: new Date() } : {}),
        },
      });
      await tx.policyAcceptance.create({
        data: {
          userId,
          policyVersion: COMMUNITY_RULES_VERSION,
          source: 'private_message',
          ip: ip && ip !== 'unknown' ? ip : null,
          userAgent: userAgent?.slice(0, 512),
        },
      });
      return created;
    });
    if (moderated.status === 'pending_review') {
      await this.moderation.recordCase(moderated, moderationContext, message.id, rawContent);
    }
    return { ok: true, moderationStatus: moderated.status };
  }

  async blockConversation(id: string, userId: bigint) {
    const conversation = await this.findConversationForUser(id, userId);
    if (!conversation) {
      throw new NotFoundException('会话不存在');
    }
    const blockedId =
      conversation.initiatorId === userId ? conversation.recipientId : conversation.initiatorId;
    await this.prisma.$transaction(async (tx) => {
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { status: 'blocked', blockedById: userId },
      });
      await tx.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId: userId, blockedId } },
        update: {},
        create: { blockerId: userId, blockedId },
      });
    });
    return { ok: true };
  }

  private async findConversationForUser(id: string, userId: bigint) {
    return this.prisma.conversation.findFirst({
      where: {
        id: this.parseId(id),
        OR: [{ initiatorId: userId }, { recipientId: userId }],
      },
      include: {
        originPost: {
          select: {
            id: true,
            title: true,
            board: { select: { name: true } },
          },
        },
        messages: {
          where: { status: { not: 'deleted' } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  private toConversation(
    conversation: NonNullable<ConversationWithRelations>,
    userId: bigint,
    unreadCount: number,
  ) {
    const visibleMessages = conversation.messages.filter(
      (message) => message.senderId === userId || message.status === 'published',
    );
    const latest = visibleMessages[visibleMessages.length - 1];
    return {
      id: String(conversation.id),
      partner: this.pseudonymFor(conversation.id),
      iAmInitiator: conversation.initiatorId === userId,
      status: conversation.status,
      origin: conversation.originPost
        ? {
            kind: 'post' as const,
            postId: String(conversation.originPost.id),
            postTitle: conversation.originPost.title,
            tag: conversation.originPost.board.name,
          }
        : undefined,
      lastMessagePreview: latest?.contentMd.slice(0, 120) ?? '',
      lastMessageAt: (latest?.createdAt ?? conversation.lastMessageAt).toISOString(),
      unreadCount,
      createdAt: conversation.createdAt.toISOString(),
    };
  }

  private canSendMore(
    conversation: { status: ConversationStatus; initiatorId: bigint },
    userId: bigint,
  ) {
    if (conversation.status === 'blocked') {
      return false;
    }
    if (conversation.status === 'pending' && conversation.initiatorId === userId) {
      return false;
    }
    return true;
  }

  private blockedReason(
    conversation: { status: ConversationStatus; blockedById: bigint | null },
    userId: bigint,
  ) {
    if (conversation.status !== 'blocked') {
      return undefined;
    }
    return conversation.blockedById === userId ? 'blocked_by_me' : 'blocked_by_partner';
  }

  private validateContent(content: string, max: number) {
    if (typeof content !== 'string') {
      throw new BadRequestException('消息格式无效');
    }
    const trimmed = content.trim();
    if (!trimmed) {
      throw new BadRequestException('消息不能为空');
    }
    if (trimmed.length > max) {
      throw new BadRequestException(`消息最多 ${max} 字`);
    }
    if (/!\[[^\]]*\]\s*\(/.test(trimmed)) {
      throw new BadRequestException('私信不支持外部图片');
    }
    return trimmed;
  }

  private renderMd(md: string): string {
    return this.markdown.render(md);
  }

  private async assertCanWrite(userId: bigint) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, suspendedUntil: true, createdAt: true },
    });
    if (!user || user.status === 'banned') {
      throw new BadRequestException('账号不可用');
    }
    if (user.status === 'suspended' && (!user.suspendedUntil || user.suspendedUntil > new Date())) {
      throw new BadRequestException('账号正在禁言中');
    }
    return user;
  }

  private pseudonymFor(conversationId: bigint) {
    const digest = createHmac('sha256', this.config.get('ANON_SECRET'))
      .update(`dm:${conversationId}`)
      .digest('hex');
    const code = digest.slice(0, 4).toUpperCase();
    const hue = Number.parseInt(digest.slice(4, 8), 16) % 360;
    return {
      displayName: `浙小商 · 会话 ${code}`,
      color: `hsl(${hue} 65% 52%)`,
      conversationCode: code,
    };
  }

  private parseId(id: string): bigint {
    try {
      return BigInt(id);
    } catch {
      throw new BadRequestException('无效 ID');
    }
  }
}

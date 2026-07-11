import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHmac } from 'crypto';
import MarkdownIt from 'markdown-it';
import type { ConversationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { AppConfig } from '../config/app.config';
import { ModerationService } from '../common/moderation.service';
import { RateLimitService } from '../common/security/rate-limit.service';

type ConversationWithRelations = Awaited<ReturnType<MessagesService['findConversationForUser']>>;

@Injectable()
export class MessagesService {
  private readonly markdown = new MarkdownIt({ html: false, linkify: true, breaks: true });

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
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
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
      where: { conversationId: conversation.id, senderId: { not: userId }, readAt: null },
      data: { readAt: new Date() },
    });

    return {
      conversation: this.toConversation(conversation, userId, 0),
      messages: conversation.messages.map((message) => ({
        id: String(message.id),
        conversationId: String(message.conversationId),
        sender: message.senderId === userId ? 'me' : 'partner',
        contentMd: message.contentMd,
        contentHtml: message.contentHtml,
        createdAt: message.createdAt.toISOString(),
        status: message.senderId === userId ? (message.readAt ? 'read' : 'sent') : undefined,
      })),
      canSendMore: this.canSendMore(conversation, userId),
      blockedReason: this.blockedReason(conversation, userId),
    };
  }

  async initiateConversation(userId: bigint, originPostId: string, initialMessage: string) {
    await this.rateLimit.consume('initiate-message-user', String(userId), 10, 3600);
    await this.assertCanWrite(userId);
    const rawContent = this.validateContent(initialMessage, 500);
    const { content: contentMd } = await this.moderation.moderateOrThrow(rawContent);
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

    const conversation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.conversation.create({
        data: {
          initiatorId: userId,
          recipientId: post.authorId,
          originPostId: post.id,
          status: 'pending',
          lastMessageAt: new Date(),
        },
      });
      await tx.directMessage.create({
        data: {
          conversationId: created.id,
          senderId: userId,
          contentMd,
          contentHtml: this.renderMd(contentMd),
        },
      });
      return created;
    });

    return { ok: true, conversationId: String(conversation.id) };
  }

  async sendMessage(id: string, userId: bigint, content: string) {
    await this.rateLimit.consume('direct-message-user', String(userId), 30, 60);
    await this.assertCanWrite(userId);
    const rawContent = this.validateContent(content, 1000);
    const { content: contentMd } = await this.moderation.moderateOrThrow(rawContent);
    const conversation = await this.findConversationForUser(id, userId);
    if (!conversation) {
      throw new NotFoundException('会话不存在');
    }

    await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.conversation.findFirst({
        where: { id: conversation.id },
      });
      if (!fresh || fresh.status === 'blocked') {
        throw new BadRequestException('该会话已封闭');
      }
      if (fresh.status === 'pending' && fresh.initiatorId === userId) {
        throw new BadRequestException('对方回复前只能发送一条消息');
      }

      await tx.directMessage.create({
        data: {
          conversationId: conversation.id,
          senderId: userId,
          contentMd,
          contentHtml: this.renderMd(contentMd),
        },
      });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          status: fresh.status === 'pending' ? 'active' : fresh.status,
          lastMessageAt: new Date(),
        },
      });
    });
    return { ok: true };
  }

  async blockConversation(id: string, userId: bigint) {
    const conversation = await this.findConversationForUser(id, userId);
    if (!conversation) {
      throw new NotFoundException('会话不存在');
    }
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: 'blocked', blockedById: userId },
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
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  private toConversation(
    conversation: NonNullable<ConversationWithRelations>,
    userId: bigint,
    unreadCount: number,
  ) {
    const partnerId =
      conversation.initiatorId === userId ? conversation.recipientId : conversation.initiatorId;
    const latest = conversation.messages[conversation.messages.length - 1];
    return {
      id: String(conversation.id),
      partner: this.pseudonymFor(conversation.id, partnerId),
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

  private async assertCanWrite(userId: bigint): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, suspendedUntil: true },
    });
    if (!user || user.status === 'banned') {
      throw new BadRequestException('账号不可用');
    }
    if (user.status === 'suspended' && (!user.suspendedUntil || user.suspendedUntil > new Date())) {
      throw new BadRequestException('账号正在禁言中');
    }
  }

  private pseudonymFor(conversationId: bigint, userId: bigint) {
    const names = ['晨星', '松风', '海盐', '青柚', '山茶', '月白', '竹影', '微光'];
    const digest = createHmac('sha256', this.config.get('ANON_SECRET'))
      .update(`${conversationId}:${userId}`)
      .digest();
    return {
      displayName: `匿名 · ${names[digest[0] % names.length]}`,
      color: `hsl(${digest[1] % 360} 65% 52%)`,
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

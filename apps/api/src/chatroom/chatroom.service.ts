import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { AppConfig } from '../config/app.config';
import { ModerationService } from '../common/moderation.service';
import { createHash, createHmac, randomBytes } from 'crypto';
import { RateLimitService } from '../common/security/rate-limit.service';
import type { Chatroom, ContentStatus, Prisma } from '@prisma/client';
import { COMMUNITY_RULES_VERSION } from '../common/community-safety.constants';
import type { AdminRole } from '../admin-auth/admin-auth.service';

export interface ChatroomDetail {
  id: string;
  uid: string;
  title: string;
  description: string | null;
  avatarUrl: string | null;
  backgroundUrl: string | null;
  creatorId: string;
  creatorUsername: string;
  createdAt: string;
  expiresAt: string;
  closedAt: string | null;
  isActive: boolean;
  participantCount: number;
}

export interface ChatroomMessageDto {
  id: string;
  chatroomUid: string;
  content: string;
  createdAt: string;
  isFlagged: boolean;
  moderationStatus: ContentStatus;
  isMine?: boolean;

  // Anonymous fields for regular users
  senderNickname: string;
  senderAvatar: string;

  // Only populated by the dedicated admin endpoint for a superadmin.
  senderIp?: string;
  realSender?: AdminChatroomSenderDto;
}

export interface AdminChatroomSenderDto {
  userId: string;
  username: string;
  email: string;
  studentId: string | null;
}

export interface AdminFlaggedMessageDto {
  id: string;
  chatroomUid: string;
  chatroomTitle: string;
  content: string;
  senderNickname: string;
  moderationStatus: ContentStatus;
  caseId: string | null;
  createdAt: string;
  senderIp?: string;
  realSender?: AdminChatroomSenderDto;
}

export interface AdminChatroomReadContext {
  actorId: bigint;
  role: AdminRole;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class ChatroomService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatroomService.name);
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly moderation: ModerationService,
    private readonly rateLimit: RateLimitService,
  ) {}

  onModuleInit() {
    // Start the cleanup background task
    this.logger.log(
      `Chatroom retention policy enabled: ${this.config.get('CHATROOM_RETENTION_DAYS')} days; legal-hold evidence is exempt from automatic deletion.`,
    );
    this.cleanupTimer = setInterval(() => {
      this.handleBackgroundCleanup().catch((err) => {
        this.logger.error('Failed to run chatroom background cleanup', err);
      });
    }, 60 * 1000); // run every 1 minute
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  // 1. Create a chatroom
  async createChatroom(
    userId: bigint,
    data: {
      title: string;
      description?: string;
      avatarUrl?: string;
      backgroundUrl?: string;
      rulesAcknowledged: boolean;
    },
    ip?: string,
    userAgent?: string,
  ): Promise<ChatroomDetail> {
    await this.rateLimit.consume('create-chatroom-user', String(userId), 2, 24 * 3600);
    if (!data.rulesAcknowledged) {
      throw new BadRequestException('请先确认聊天房主题和简介同样遵守社区规则');
    }
    await this.assertCanWrite(userId);
    const title = data.title.trim();
    if (!title) {
      throw new BadRequestException('聊天房主题不能为空');
    }
    if (title.length > 100) {
      throw new BadRequestException('聊天房主题长度不能超过100个字符');
    }
    if (data.description && data.description.length > 500) {
      throw new BadRequestException('聊天房简介长度不能超过500个字符');
    }
    const description = data.description?.trim() || undefined;
    const moderationContext = {
      surface: 'chatroom_message' as const,
      authorId: userId,
      ip,
      userAgent,
    };
    const moderatedTitle = await this.moderation.moderateOrThrow(title, moderationContext);
    const moderatedDescription = description
      ? await this.moderation.moderateOrThrow(description, moderationContext)
      : null;
    const pendingResult = [moderatedTitle, moderatedDescription]
      .filter((result): result is NonNullable<typeof result> => Boolean(result))
      .sort((left, right) => right.riskLevel - left.riskLevel)
      .find((result) => result.status === 'pending_review');
    if (pendingResult) {
      await this.moderation.recordCase(
        pendingResult,
        moderationContext,
        undefined,
        `${title}\n${description ?? ''}`,
      );
      throw new BadRequestException('聊天房主题或简介需要人工审核，请修改后重试');
    }
    const mediaUrls = await this.validateChatroomMediaUrls(
      [data.avatarUrl, data.backgroundUrl].filter((value): value is string => Boolean(value)),
      userId,
    );
    const avatarUrl = data.avatarUrl ? (mediaUrls.shift() ?? null) : null;
    const backgroundUrl = data.backgroundUrl ? (mediaUrls.shift() ?? null) : null;

    // C. Generate uid
    const uid = 'cr-' + randomBytes(8).toString('hex');

    // D. Expiration: 2 hours from now
    const expiresAt = new Date(Date.now() + 2 * 3600 * 1000);

    const chatroom = await this.prisma.$transaction(async (tx) => {
      // Re-check limits inside transaction to prevent race conditions
      const activeCount = await tx.chatroom.count({
        where: {
          closedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (activeCount >= 10) {
        throw new BadRequestException(
          '平台当前已存在10个活跃聊天房，请等待旧房间关闭后再开启新房间',
        );
      }

      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const userTodayCount = await tx.chatroom.count({
        where: {
          creatorId: userId,
          createdAt: { gte: startOfDay, lte: endOfDay },
        },
      });
      if (userTodayCount >= 2) {
        throw new BadRequestException('每个用户每天最多只能发起2个聊天房');
      }

      const room = await tx.chatroom.create({
        data: {
          uid,
          title: moderatedTitle.content,
          description: moderatedDescription?.content ?? null,
          avatarUrl,
          backgroundUrl,
          creatorId: userId,
          expiresAt,
        },
        include: {
          creator: true,
        },
      });

      // Automatically add the creator as participant
      await tx.chatroomParticipant.create({
        data: {
          chatroomId: room.id,
          userId,
        },
      });

      const uploadKeys = [avatarUrl, backgroundUrl]
        .filter((value): value is string => Boolean(value))
        .map((value) => this.cdnUploadKey(value));
      if (uploadKeys.length > 0) {
        await tx.upload.updateMany({
          where: { userId, s3Key: { in: uploadKeys } },
          data: { attachedToType: 'chatroom', attachedToId: room.id },
        });
      }
      await tx.policyAcceptance.create({
        data: {
          userId,
          policyVersion: COMMUNITY_RULES_VERSION,
          source: 'publish',
          ip: ip && ip !== 'unknown' ? ip : null,
          userAgent: userAgent?.slice(0, 512),
        },
      });

      return room;
    });

    return this.mapToDetailDto(chatroom, 1);
  }

  // 2. List all non-deleted chatrooms
  async listChatrooms(): Promise<ChatroomDetail[]> {
    const rooms = await this.prisma.chatroom.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        creator: true,
        _count: {
          select: { participants: true },
        },
      },
    });

    const now = new Date();
    const visibleMediaKeys = await this.visibleChatroomMediaKeys(rooms);
    return rooms.map((room) => {
      const isActive = !room.closedAt && room.expiresAt > now;
      return {
        id: String(room.id),
        uid: room.uid,
        title: room.title,
        description: room.description,
        avatarUrl: this.visibleChatroomMediaUrl(room.avatarUrl, visibleMediaKeys),
        backgroundUrl: this.visibleChatroomMediaUrl(room.backgroundUrl, visibleMediaKeys),
        creatorId: String(room.creatorId),
        creatorUsername: room.creator.username,
        createdAt: room.createdAt.toISOString(),
        expiresAt: room.expiresAt.toISOString(),
        closedAt: room.closedAt?.toISOString() ?? null,
        isActive,
        participantCount: room._count.participants,
      };
    });
  }

  // 3. Get chatroom detail
  async getChatroomDetail(uid: string): Promise<ChatroomDetail> {
    const room = await this.prisma.chatroom.findUnique({
      where: { uid },
      include: {
        creator: true,
        _count: {
          select: { participants: true },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('该聊天房不存在');
    }

    const now = new Date();
    const isActive = !room.closedAt && room.expiresAt > now;
    const visibleMediaKeys = await this.visibleChatroomMediaKeys([room]);

    return {
      id: String(room.id),
      uid: room.uid,
      title: room.title,
      description: room.description,
      avatarUrl: this.visibleChatroomMediaUrl(room.avatarUrl, visibleMediaKeys),
      backgroundUrl: this.visibleChatroomMediaUrl(room.backgroundUrl, visibleMediaKeys),
      creatorId: String(room.creatorId),
      creatorUsername: room.creator.username,
      createdAt: room.createdAt.toISOString(),
      expiresAt: room.expiresAt.toISOString(),
      closedAt: room.closedAt?.toISOString() ?? null,
      isActive,
      participantCount: room._count.participants,
    };
  }

  // 4. Close chatroom early
  async closeChatroom(
    uid: string,
    userId: bigint,
    isAdmin: boolean,
    adminIp?: string,
    adminUserAgent?: string,
  ): Promise<void> {
    const room = await this.prisma.chatroom.findUnique({
      where: { uid },
    });

    if (!room) {
      throw new NotFoundException('该聊天房不存在');
    }

    if (room.closedAt || room.expiresAt <= new Date()) {
      throw new BadRequestException('该聊天房已经处于关闭状态');
    }

    // Only owner or admin can close
    if (room.creatorId !== userId && !isAdmin) {
      throw new ForbiddenException('您没有权限关闭该聊天房');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.chatroom.update({
        where: { id: room.id },
        data: { closedAt: new Date() },
      });
      if (isAdmin) {
        await tx.auditLog.create({
          data: {
            actorId: userId,
            action: 'chatroom.close',
            targetType: 'chatroom',
            targetId: room.id,
            ip: adminIp && adminIp !== 'unknown' ? adminIp : null,
            userAgent: adminUserAgent?.slice(0, 512),
            metadata: { chatroomUid: room.uid, title: room.title },
          },
        });
      }
    });
  }

  // 5. Send message
  async sendMessage(
    uid: string,
    userId: bigint,
    content: string,
    senderIp: string,
    rulesAcknowledged: boolean,
    senderUserAgent?: string,
  ): Promise<ChatroomMessageDto> {
    await this.rateLimit.consume('chatroom-message-user', String(userId), 30, 60);
    if (!rulesAcknowledged) {
      throw new BadRequestException('请先确认聊天房发言同样遵守社区规则');
    }
    const sender = await this.assertCanWrite(userId);
    if (Date.now() - sender.createdAt.getTime() < 7 * 24 * 60 * 60 * 1000) {
      await this.rateLimit.consume(
        'chatroom-message-new-user',
        String(userId),
        15,
        10 * 60,
        '新用户保护期内发言过于频繁，请稍后再试',
      );
    }
    const room = await this.prisma.chatroom.findUnique({
      where: { uid },
    });

    if (!room) {
      throw new NotFoundException('该聊天房不存在');
    }

    const now = new Date();
    if (room.closedAt || room.expiresAt <= now) {
      throw new BadRequestException('该聊天房已关闭，无法发送言论');
    }

    const trimmed = content.trim();
    if (!trimmed) {
      throw new BadRequestException('言论内容不能为空');
    }
    if (trimmed.length > 2000) {
      throw new BadRequestException('言论内容最长2000个字符');
    }

    const moderationContext = {
      surface: 'chatroom_message' as const,
      authorId: userId,
      ip: senderIp,
      userAgent: senderUserAgent,
    };
    const moderated = await this.moderation.moderateOrThrow(trimmed, moderationContext);

    const msg = await this.prisma.$transaction(async (tx) => {
      const freshRoom = await tx.chatroom.findUnique({
        where: { id: room.id },
        select: { closedAt: true, expiresAt: true },
      });
      if (!freshRoom || freshRoom.closedAt || freshRoom.expiresAt <= new Date()) {
        throw new BadRequestException('该聊天房已关闭，无法发送言论');
      }
      await tx.chatroomParticipant.upsert({
        where: {
          chatroomId_userId: {
            chatroomId: room.id,
            userId,
          },
        },
        update: {},
        create: {
          chatroomId: room.id,
          userId,
        },
      });
      const created = await tx.chatroomMessage.create({
        data: {
          chatroomId: room.id,
          senderId: userId,
          content: moderated.content,
          senderIp,
          senderUserAgent: senderUserAgent?.slice(0, 512),
          status: moderated.status,
          moderationLabels: this.moderation.moderationLabels(
            moderated,
          ) as unknown as Prisma.InputJsonValue,
          contentHash: moderated.contentHash,
          legalHold: moderated.status === 'pending_review' && moderated.riskLevel >= 4,
          isFlagged: moderated.status === 'pending_review',
        },
      });
      await tx.policyAcceptance.create({
        data: {
          userId,
          policyVersion: COMMUNITY_RULES_VERSION,
          source: 'publish',
          ip: senderIp && senderIp !== 'unknown' ? senderIp : null,
          userAgent: senderUserAgent?.slice(0, 512),
        },
      });
      return created;
    });
    if (moderated.status === 'pending_review') {
      await this.moderation.recordCase(moderated, moderationContext, msg.id, trimmed);
      if (moderated.riskLevel >= 4) {
        await this.prisma.chatroom.update({
          where: { id: room.id },
          data: { legalHold: true },
        });
      }
    }

    // Map to response Dto (default return is for the sender, so we can return custom details)
    const pseudonym = this.generatePseudonym(msg.senderId, room.id);
    return {
      id: String(msg.id),
      chatroomUid: room.uid,
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
      isFlagged: msg.isFlagged,
      moderationStatus: msg.status,
      isMine: true,
      senderNickname: pseudonym.name,
      senderAvatar: pseudonym.avatar,
    };
  }

  // 6. Get messages in chatroom
  async getMessages(uid: string, userId: bigint, afterId?: string): Promise<ChatroomMessageDto[]> {
    const room = await this.prisma.chatroom.findUnique({
      where: { uid },
    });

    if (!room) {
      throw new NotFoundException('该聊天房不存在');
    }

    let parsedAfterId: bigint | undefined;
    if (afterId) {
      try {
        parsedAfterId = BigInt(afterId);
        if (parsedAfterId <= 0n) {
          throw new Error('invalid cursor');
        }
      } catch {
        throw new BadRequestException('无效的消息游标');
      }
    }

    const messages = await this.prisma.chatroomMessage.findMany({
      where: {
        chatroomId: room.id,
        OR: [{ status: 'published' as const }, { senderId: userId }],
        ...(parsedAfterId ? { id: { gt: parsedAfterId } } : {}),
      },
      orderBy: { id: parsedAfterId ? 'asc' : 'desc' },
      take: 200,
    });
    if (!parsedAfterId) {
      messages.reverse();
    }

    const dtos: ChatroomMessageDto[] = [];
    for (const msg of messages) {
      const pseudonym = this.generatePseudonym(msg.senderId, room.id);
      const dto: ChatroomMessageDto = {
        id: String(msg.id),
        chatroomUid: room.uid,
        content: msg.content,
        createdAt: msg.createdAt.toISOString(),
        isFlagged: msg.isFlagged,
        moderationStatus: msg.status,
        isMine: msg.senderId === userId,
        senderNickname: pseudonym.name,
        senderAvatar: pseudonym.avatar,
      };

      dtos.push(dto);
    }

    return dtos;
  }

  /**
   * Dedicated monitoring read path. Moderators and ordinary admins receive the
   * same room-scoped pseudonyms as users. A superadmin receives the trace
   * fields only after the corresponding audit record has been persisted.
   */
  async getMessagesForAdmin(
    uid: string,
    context: AdminChatroomReadContext,
    afterId?: string,
  ): Promise<ChatroomMessageDto[]> {
    const room = await this.prisma.chatroom.findUnique({
      where: { uid },
      select: { id: true, uid: true },
    });
    if (!room) {
      throw new NotFoundException('该聊天房不存在');
    }

    let parsedAfterId: bigint | undefined;
    if (afterId) {
      try {
        parsedAfterId = BigInt(afterId);
        if (parsedAfterId <= 0n) {
          throw new Error('invalid cursor');
        }
      } catch {
        throw new BadRequestException('无效的消息游标');
      }
    }

    const messages = await this.prisma.chatroomMessage.findMany({
      where: {
        chatroomId: room.id,
        ...(parsedAfterId ? { id: { gt: parsedAfterId } } : {}),
      },
      orderBy: { id: parsedAfterId ? 'asc' : 'desc' },
      take: 200,
    });
    if (!parsedAfterId) {
      messages.reverse();
    }

    const canTrace = context.role === 'superadmin';
    const senderById = new Map<bigint, { id: bigint; username: string; email: string }>();
    const studentIdByEmail = new Map<string, string>();

    if (canTrace && messages.length > 0) {
      const senders = await this.prisma.user.findMany({
        where: { id: { in: [...new Set(messages.map((message) => message.senderId))] } },
        select: { id: true, username: true, email: true },
      });
      for (const sender of senders) {
        senderById.set(sender.id, sender);
      }

      const emails = [...new Set(senders.map((sender) => sender.email.toLowerCase()))];
      if (emails.length > 0) {
        const registrations = await this.prisma.registrationRequest.findMany({
          where: { email: { in: emails } },
          select: { email: true, studentId: true },
        });
        for (const registration of registrations) {
          studentIdByEmail.set(registration.email.toLowerCase(), registration.studentId);
        }
      }
    }

    const result = messages.map((message): ChatroomMessageDto => {
      const pseudonym = this.generatePseudonym(message.senderId, room.id);
      const dto: ChatroomMessageDto = {
        id: String(message.id),
        chatroomUid: room.uid,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        isFlagged: message.isFlagged,
        moderationStatus: message.status,
        senderNickname: pseudonym.name,
        senderAvatar: pseudonym.avatar,
      };

      if (canTrace) {
        const sender = senderById.get(message.senderId);
        if (sender) {
          dto.senderIp = message.senderIp;
          dto.realSender = {
            userId: String(sender.id),
            username: sender.username,
            email: sender.email,
            studentId: studentIdByEmail.get(sender.email.toLowerCase()) ?? null,
          };
        }
      }
      return dto;
    });

    // An empty incremental poll does not expose any new identity. The initial
    // room snapshot and every incremental response containing a new message
    // are audited before trace fields leave the service.
    if (canTrace && (!parsedAfterId || messages.length > 0)) {
      const lastMessage = messages.at(-1);
      await this.prisma.auditLog.create({
        data: {
          actorId: context.actorId,
          action: 'chatroom.identity.view',
          targetType: 'chatroom',
          targetId: room.id,
          ip: context.ip && context.ip !== 'unknown' ? context.ip : null,
          userAgent: context.userAgent?.slice(0, 512),
          metadata: {
            chatroomUid: room.uid,
            messageCount: messages.length,
            distinctSenderCount: new Set(messages.map((message) => String(message.senderId))).size,
            firstMessageId: messages[0] ? String(messages[0].id) : null,
            lastMessageId: lastMessage ? String(lastMessage.id) : null,
            cursorAfterId: parsedAfterId ? String(parsedAfterId) : null,
          },
        },
      });
    }

    return result;
  }

  // 7. Flag / mark a message (Admins only)
  async flagMessage(
    messageId: string,
    adminUserId: bigint,
    adminIp?: string,
    adminUserAgent?: string,
  ): Promise<void> {
    let id: bigint;
    try {
      id = BigInt(messageId);
    } catch {
      throw new BadRequestException('无效的消息ID');
    }
    const msg = await this.prisma.chatroomMessage.findUnique({
      where: { id },
      include: {
        chatroom: true,
      },
    });

    if (!msg) {
      throw new NotFoundException('该言论不存在');
    }

    if (!msg.isFlagged || msg.status !== 'pending_review' || !msg.legalHold) {
      await this.prisma.$transaction([
        this.prisma.chatroomMessage.update({
          where: { id: msg.id },
          data: { isFlagged: true, status: 'pending_review', legalHold: true },
        }),
        this.prisma.chatroom.update({
          where: { id: msg.chatroomId },
          data: { legalHold: true },
        }),
        this.prisma.auditLog.create({
          data: {
            actorId: adminUserId,
            action: 'chatroom-message.flag',
            targetType: 'chatroom-message',
            targetId: msg.id,
            ip: adminIp && adminIp !== 'unknown' ? adminIp : null,
            userAgent: adminUserAgent?.slice(0, 512),
            metadata: {
              chatroomUid: msg.chatroom.uid,
              // The audit record may retain the internal subject ID, but it is
              // never returned by the monitoring list APIs.
              senderId: String(msg.senderId),
            },
          },
        }),
      ]);
    }

    const contentHash = msg.contentHash ?? createHash('sha256').update(msg.content).digest('hex');
    await this.moderation.recordCase(
      {
        content: msg.content,
        status: 'pending_review',
        blocked: false,
        matches: [],
        reasonCodes: ['manual_admin_flag'],
        riskLevel: 3,
        contentHash,
      },
      {
        surface: 'chatroom_message',
        authorId: msg.senderId,
        ip: msg.senderIp,
        userAgent: msg.senderUserAgent ?? undefined,
      },
      msg.id,
      msg.content,
    );
  }

  // Helper: map Chatroom to Detail DTO
  private mapToDetailDto(
    room: Chatroom & { creator: { username: string } },
    participantCount: number,
  ): ChatroomDetail {
    const now = new Date();
    const isActive = !room.closedAt && room.expiresAt > now;
    return {
      id: String(room.id),
      uid: room.uid,
      title: room.title,
      description: room.description,
      avatarUrl: room.avatarUrl,
      backgroundUrl: room.backgroundUrl,
      creatorId: String(room.creatorId),
      creatorUsername: room.creator.username,
      createdAt: room.createdAt.toISOString(),
      expiresAt: room.expiresAt.toISOString(),
      closedAt: room.closedAt?.toISOString() ?? null,
      isActive,
      participantCount,
    };
  }

  // Helper: HMAC-based stable pseudonym (non-reversible, per-room)
  private generatePseudonym(userId: bigint, roomId: bigint): { name: string; avatar: string } {
    const words = [
      '晨曦',
      '松风',
      '海盐',
      '星河',
      '青柚',
      '云朵',
      '山茶',
      '微光',
      '竹影',
      '月白',
      '橙子',
      '南风',
    ];
    const digest = createHmac('sha256', this.config.get('ANON_SECRET'))
      .update(`chatroom:${roomId}:${userId}`)
      .digest();
    const name = words[digest[0] % words.length];
    const hue = digest[1] % 360;
    const color = `hsl(${hue} 65% 52%)`;
    // Generate a deterministic anonymous avatar SVG
    const avatar = `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="20" fill="${color}"/><text x="20" y="26" text-anchor="middle" fill="white" font-size="18">${name[0]}</text></svg>`,
    )}`;
    return { name: `匿名 · ${name}`, avatar };
  }

  // 9. Get all flagged messages for the moderation team. Identity fields are
  // attached only for a superadmin and the disclosure is automatically audited.
  async getFlaggedMessages(context: AdminChatroomReadContext): Promise<AdminFlaggedMessageDto[]> {
    const messages = await this.prisma.chatroomMessage.findMany({
      where: { isFlagged: true },
      include: {
        chatroom: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const cases = await this.prisma.moderationCase.findMany({
      where: {
        surface: 'chatroom_message',
        targetId: { in: messages.map((message) => message.id) },
      },
      select: { id: true, targetId: true },
    });
    const caseIdByMessage = new Map(
      cases
        .filter((item): item is typeof item & { targetId: bigint } => item.targetId !== null)
        .map((item) => [item.targetId, String(item.id)]),
    );

    const canTrace = context.role === 'superadmin';
    const senderById = new Map<bigint, { id: bigint; username: string; email: string }>();
    const studentIdByEmail = new Map<string, string>();
    if (canTrace && messages.length > 0) {
      const senders = await this.prisma.user.findMany({
        where: { id: { in: [...new Set(messages.map((message) => message.senderId))] } },
        select: { id: true, username: true, email: true },
      });
      for (const sender of senders) {
        senderById.set(sender.id, sender);
      }
      const emails = [...new Set(senders.map((sender) => sender.email.toLowerCase()))];
      if (emails.length > 0) {
        const registrations = await this.prisma.registrationRequest.findMany({
          where: { email: { in: emails } },
          select: { email: true, studentId: true },
        });
        for (const registration of registrations) {
          studentIdByEmail.set(registration.email.toLowerCase(), registration.studentId);
        }
      }
    }

    const result: AdminFlaggedMessageDto[] = [];
    for (const msg of messages) {
      const pseudonym = this.generatePseudonym(msg.senderId, msg.chatroomId);
      const dto: AdminFlaggedMessageDto = {
        id: String(msg.id),
        chatroomUid: msg.chatroom.uid,
        chatroomTitle: msg.chatroom.title,
        content: msg.content,
        senderNickname: pseudonym.name,
        moderationStatus: msg.status,
        caseId: caseIdByMessage.get(msg.id) ?? null,
        createdAt: msg.createdAt.toISOString(),
      };
      if (canTrace) {
        const sender = senderById.get(msg.senderId);
        if (sender) {
          dto.senderIp = msg.senderIp;
          dto.realSender = {
            userId: String(sender.id),
            username: sender.username,
            email: sender.email,
            studentId: studentIdByEmail.get(sender.email.toLowerCase()) ?? null,
          };
        }
      }
      result.push(dto);
    }

    if (canTrace) {
      await this.prisma.auditLog.create({
        data: {
          actorId: context.actorId,
          action: 'chatroom.flagged-identity.view',
          targetType: 'chatroom-message',
          ip: context.ip && context.ip !== 'unknown' ? context.ip : null,
          userAgent: context.userAgent?.slice(0, 512),
          metadata: {
            messageCount: messages.length,
            distinctSenderCount: new Set(messages.map((message) => String(message.senderId))).size,
            messageIds: messages.map((message) => String(message.id)),
          },
        },
      });
    }
    return result;
  }

  private async validateChatroomMediaUrls(values: string[], userId: bigint): Promise<string[]> {
    if (values.length === 0) {
      return [];
    }
    if (values.length > 2) {
      throw new BadRequestException('聊天房媒体文件数量过多');
    }
    const keys = values.map((value) => this.cdnUploadKey(value));
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('聊天房图片不能重复');
    }
    const owned = await this.prisma.upload.findMany({
      where: {
        userId,
        s3Key: { in: keys },
        moderationStatus: { in: ['pending', 'passed', 'flagged'] },
      },
      select: { s3Key: true },
    });
    if (owned.length !== keys.length) {
      throw new BadRequestException('图片不存在或不属于当前用户');
    }
    const base = this.config.get('CDN_BASE_URL').replace(/\/+$/, '');
    return keys.map((key) => `${base}/${key}`);
  }

  private async visibleChatroomMediaKeys(
    rooms: Array<{ avatarUrl: string | null; backgroundUrl: string | null }>,
  ) {
    const keys = new Set<string>();
    for (const room of rooms) {
      for (const value of [room.avatarUrl, room.backgroundUrl]) {
        if (!value) {
          continue;
        }
        try {
          keys.add(this.cdnUploadKey(value));
        } catch {
          // Invalid legacy media URLs are never exposed.
        }
      }
    }
    if (keys.size === 0) {
      return new Set<string>();
    }
    const passed = await this.prisma.upload.findMany({
      where: { s3Key: { in: [...keys] }, moderationStatus: 'passed' },
      select: { s3Key: true },
    });
    return new Set(passed.map((upload) => upload.s3Key));
  }

  private visibleChatroomMediaUrl(value: string | null, visibleKeys: Set<string>) {
    if (!value) {
      return null;
    }
    try {
      return visibleKeys.has(this.cdnUploadKey(value)) ? value : null;
    } catch {
      return null;
    }
  }

  private async assertCanWrite(userId: bigint) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, suspendedUntil: true, createdAt: true },
    });
    if (!user || user.status === 'banned') {
      throw new ForbiddenException('账号不可用');
    }
    if (user.status === 'suspended' && (!user.suspendedUntil || user.suspendedUntil > new Date())) {
      throw new ForbiddenException('账号正在禁言中');
    }
    return user;
  }

  private cdnUploadKey(value: string): string {
    if (value.length > 2048) {
      throw new BadRequestException('无效的图片地址');
    }
    try {
      const base = new URL(`${this.config.get('CDN_BASE_URL').replace(/\/+$/, '')}/`);
      const url = new URL(value);
      if (
        url.origin !== base.origin ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !url.pathname.startsWith(base.pathname)
      ) {
        throw new Error('untrusted URL');
      }
      const key = url.pathname.slice(base.pathname.length);
      if (!key.startsWith('chatrooms/') || !/^[A-Za-z0-9/_-]+\.(?:jpg|png)$/.test(key)) {
        throw new Error('untrusted key');
      }
      return key;
    } catch {
      throw new BadRequestException('无效的图片地址');
    }
  }

  // 8. Background clean up task running every 1 minute
  private async handleBackgroundCleanup(): Promise<void> {
    const now = new Date();

    // A. Auto-close expired chatrooms: 2h past creation or has expiresAt <= now
    const expiredCount = await this.prisma.chatroom.updateMany({
      where: {
        closedAt: null,
        expiresAt: { lte: now },
      },
      data: {
        closedAt: now,
      },
    });

    if (expiredCount.count > 0) {
      this.logger.log(`Auto-closed ${expiredCount.count} expired chatrooms.`);
    }

    // B. Apply the configured retention policy from room creation time.
    // Legal-hold rooms are never automatically deleted. Once they cross the
    // same retention threshold, minimize them to held evidence only.
    const retentionDays = this.config.get('CHATROOM_RETENTION_DAYS');
    const deleteThreshold = new Date(now.getTime() - retentionDays * 24 * 3600 * 1000);
    const heldRooms = await this.prisma.chatroom.findMany({
      where: { createdAt: { lte: deleteThreshold }, legalHold: true },
      select: { id: true },
    });
    if (heldRooms.length > 0) {
      const heldRoomIds = heldRooms.map((room) => room.id);
      const [removedMessages, removedParticipants] = await this.prisma.$transaction([
        this.prisma.chatroomMessage.deleteMany({
          where: { chatroomId: { in: heldRoomIds }, legalHold: false },
        }),
        this.prisma.chatroomParticipant.deleteMany({
          where: { chatroomId: { in: heldRoomIds } },
        }),
      ]);
      if (removedMessages.count > 0 || removedParticipants.count > 0) {
        this.logger.log(
          `Minimized ${heldRooms.length} legal-hold chatrooms after the ${retentionDays}-day retention threshold: removed ${removedMessages.count} non-held messages and ${removedParticipants.count} unrelated participant records; held messages were retained.`,
        );
      }
    }
    const toDelete = await this.prisma.chatroom.findMany({
      where: {
        createdAt: { lte: deleteThreshold },
        legalHold: false,
      },
      select: { id: true, uid: true },
    });

    if (toDelete.length > 0) {
      const ids = toDelete.map((r) => r.id);
      const uids = toDelete.map((r) => r.uid);

      // Cascade deletes are supported by Prisma constraints, but we can call deleteMany directly
      const deleteResult = await this.prisma.chatroom.deleteMany({
        where: {
          id: { in: ids },
        },
      });

      this.logger.log(
        `Auto-deleted ${deleteResult.count} chatrooms (UIDs: ${uids.join(
          ', ',
        )}) after the configured ${retentionDays}-day retention period.`,
      );
    }
  }
}

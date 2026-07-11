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
import { createHmac, randomBytes } from 'crypto';
import { RateLimitService } from '../common/security/rate-limit.service';

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
  senderIp?: string; // only for admins
  isFlagged: boolean;

  // Anonymous fields for regular users
  senderNickname: string;
  senderAvatar: string;

  // Real identity fields for admins
  realSender?: {
    userId: string;
    username: string;
    studentId: string;
    email: string;
    role: string;
  };
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
    data: { title: string; description?: string; avatarUrl?: string; backgroundUrl?: string },
  ): Promise<ChatroomDetail> {
    await this.rateLimit.consume('create-chatroom-user', String(userId), 2, 24 * 3600);
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
    const mediaUrls = await this.validateChatroomMediaUrls(
      [data.avatarUrl, data.backgroundUrl].filter((value): value is string => Boolean(value)),
      userId,
    );
    const avatarUrl = data.avatarUrl ? mediaUrls.shift() ?? null : null;
    const backgroundUrl = data.backgroundUrl ? mediaUrls.shift() ?? null : null;

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
          title,
          description: data.description || null,
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
    return rooms.map((room) => {
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
      participantCount: room._count.participants,
    };
  }

  // 4. Close chatroom early
  async closeChatroom(uid: string, userId: bigint, isAdmin: boolean): Promise<void> {
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

    await this.prisma.chatroom.update({
      where: { id: room.id },
      data: { closedAt: new Date() },
    });
  }

  // 5. Send message
  async sendMessage(
    uid: string,
    userId: bigint,
    content: string,
    senderIp: string,
  ): Promise<ChatroomMessageDto> {
    await this.rateLimit.consume('chatroom-message-user', String(userId), 30, 60);
    await this.assertCanWrite(userId);
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

    const moderated = await this.moderation.moderateOrThrow(trimmed);

    // Auto-join user as participant if not already joined
    await this.prisma.chatroomParticipant.upsert({
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

    const msg = await this.prisma.chatroomMessage.create({
      data: {
        chatroomId: room.id,
        senderId: userId,
        content: moderated.content,
        senderIp,
        isFlagged: moderated.status === 'pending_review',
      },
    });

    // Map to response Dto (default return is for the sender, so we can return custom details)
    const pseudonym = this.generatePseudonym(msg.senderId, room.id);
    return {
      id: String(msg.id),
      chatroomUid: room.uid,
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
      isFlagged: msg.isFlagged,
      senderNickname: pseudonym.name,
      senderAvatar: pseudonym.avatar,
    };
  }

  // 6. Get messages in chatroom
  async getMessages(
    uid: string,
    userId: bigint,
    isAdmin: boolean,
    afterId?: string,
  ): Promise<ChatroomMessageDto[]> {
    void userId;
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
        if (parsedAfterId <= 0n) throw new Error('invalid cursor');
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
        include: {
          sender: true,
        },
      });
    if (!parsedAfterId) messages.reverse();

    const studentIdByEmail = new Map<string, string>();
    if (isAdmin) {
      const emails = [...new Set(messages.map((message) => message.sender.email))];
      const registrations = await this.prisma.registrationRequest.findMany({
        where: { email: { in: emails } },
        select: { email: true, studentId: true },
      });
      for (const registration of registrations) {
        studentIdByEmail.set(registration.email.toLowerCase(), registration.studentId);
      }
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
        senderNickname: pseudonym.name,
        senderAvatar: pseudonym.avatar,
      };

      if (isAdmin) {
        dto.senderIp = msg.senderIp;
        dto.realSender = {
          userId: String(msg.senderId),
          username: msg.sender.username,
          studentId: studentIdByEmail.get(msg.sender.email.toLowerCase()) ?? 'unknown',
          email: msg.sender.email,
          role: msg.sender.role,
        };
      }

      dtos.push(dto);
    }

    return dtos;
  }

  // 7. Flag / mark a message (Admins only)
  async flagMessage(messageId: string, adminUserId: bigint): Promise<void> {
    let id: bigint;
    try {
      id = BigInt(messageId);
    } catch {
      throw new BadRequestException('无效的消息ID');
    }
    const msg = await this.prisma.chatroomMessage.findUnique({
      where: { id },
      include: {
        sender: true,
        chatroom: true,
      },
    });

    if (!msg) {
      throw new NotFoundException('该言论不存在');
    }

    if (msg.isFlagged) {
      return; // already flagged
    }

    await this.prisma.$transaction([
      this.prisma.chatroomMessage.update({
        where: { id: msg.id },
        data: { isFlagged: true },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: adminUserId,
          action: 'chatroom-message.flag',
          targetType: 'chatroom-message',
          targetId: msg.id,
          metadata: {
            chatroomUid: msg.chatroom.uid,
            senderId: String(msg.senderId),
          },
        },
      }),
    ]);
  }

  // Helper: map Chatroom to Detail DTO
  private mapToDetailDto(room: any, participantCount: number): ChatroomDetail {
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

  // 9. Get all flagged messages for admin
  async getFlaggedMessages(): Promise<any[]> {
    const messages = await this.prisma.chatroomMessage.findMany({
      where: { isFlagged: true },
      include: {
        sender: true,
        chatroom: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const registrations = await this.prisma.registrationRequest.findMany({
      where: { email: { in: [...new Set(messages.map((message) => message.sender.email))] } },
      select: { email: true, studentId: true },
    });
    const studentIdByEmail = new Map(
      registrations.map((registration) => [
        registration.email.toLowerCase(),
        registration.studentId,
      ]),
    );

    const result = [];
    for (const msg of messages) {
      const pseudonym = this.generatePseudonym(msg.senderId, msg.chatroomId);
      result.push({
        id: String(msg.id),
        chatroomUid: msg.chatroom.uid,
        chatroomTitle: msg.chatroom.title,
        content: msg.content,
        senderIp: msg.senderIp,
        studentId: studentIdByEmail.get(msg.sender.email.toLowerCase()) ?? 'unknown',
        senderNickname: pseudonym.name,
        createdAt: msg.createdAt.toISOString(),
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
    const owned = await this.prisma.upload.count({
      where: {
        userId,
        s3Key: { in: keys },
        moderationStatus: 'passed',
      },
    });
    if (owned !== keys.length) {
      throw new BadRequestException('图片不存在或不属于当前用户');
    }
    const base = this.config.get('CDN_BASE_URL').replace(/\/+$/, '');
    return keys.map((key) => `${base}/${key}`);
  }

  private async assertCanWrite(userId: bigint): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, suspendedUntil: true },
    });
    if (!user || user.status === 'banned') {
      throw new ForbiddenException('账号不可用');
    }
    if (user.status === 'suspended' && (!user.suspendedUntil || user.suspendedUntil > new Date())) {
      throw new ForbiddenException('账号正在禁言中');
    }
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

    // B. Delete chatroom data older than 72h: 72h past creation
    const deleteThreshold = new Date(Date.now() - 72 * 3600 * 1000); // 72 hours ago
    const toDelete = await this.prisma.chatroom.findMany({
      where: {
        createdAt: { lte: deleteThreshold },
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
        )}) older than 72 hours.`,
      );
    }
  }
}

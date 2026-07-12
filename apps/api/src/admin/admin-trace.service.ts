import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';
import { PrismaService } from '../prisma/prisma.module';
import type { TraceDirectMessagesQueryDto } from './admin-trace.dto';

const MAX_DATABASE_ID = 9_223_372_036_854_775_807n;

const userIdentitySelect = {
  id: true,
  username: true,
  email: true,
} satisfies Prisma.UserSelect;

const directMessageTraceSelect = {
  id: true,
  contentMd: true,
  contentHtml: true,
  status: true,
  moderationLabels: true,
  senderIp: true,
  senderUserAgent: true,
  legalHold: true,
  readAt: true,
  createdAt: true,
  sender: { select: userIdentitySelect },
  conversation: {
    select: {
      id: true,
      originPostId: true,
      status: true,
      blockedById: true,
      lastMessageAt: true,
      createdAt: true,
      updatedAt: true,
      initiator: { select: userIdentitySelect },
      recipient: { select: userIdentitySelect },
    },
  },
} satisfies Prisma.DirectMessageSelect;

type TraceMessageRecord = Prisma.DirectMessageGetPayload<{
  select: typeof directMessageTraceSelect;
}>;

interface NormalizedTraceQuery {
  messageId?: bigint;
  conversationId?: bigint;
  userId?: bigint;
  page: number;
  pageSize: number;
}

@Injectable()
export class AdminTraceService {
  constructor(private readonly prisma: PrismaService) {}

  async traceDirectMessages(
    query: TraceDirectMessagesQueryDto,
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    this.assertSuperadmin(admin);
    const normalized = this.normalizeQuery(query);
    const where = this.buildWhere(normalized);

    return this.prisma.$transaction(async (tx) => {
      const total = await tx.directMessage.count({ where });

      // The audit insert intentionally precedes every query that selects identity,
      // message content, IP or user-agent fields. A failed insert aborts the
      // transaction before any sensitive result can be returned.
      await tx.auditLog.create({
        data: {
          actorId: this.parseAdminId(admin.id),
          action: 'admin.trace.direct_messages.viewed',
          targetType: normalized.messageId
            ? 'direct_message'
            : normalized.conversationId
              ? 'conversation'
              : 'user',
          targetId: normalized.messageId ?? normalized.conversationId ?? normalized.userId,
          ip: ip && ip !== 'unknown' ? ip : null,
          userAgent: (Array.isArray(userAgent) ? userAgent.join(', ') : userAgent)?.slice(0, 512),
          metadata: {
            messageId: normalized.messageId ? String(normalized.messageId) : null,
            conversationId: normalized.conversationId ? String(normalized.conversationId) : null,
            userId: normalized.userId ? String(normalized.userId) : null,
            page: normalized.page,
            pageSize: normalized.pageSize,
            resultCount: total,
            actorId: admin.id,
            actorUsername: admin.username,
            actorRole: admin.role,
          },
        },
      });

      const messages = await tx.directMessage.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (normalized.page - 1) * normalized.pageSize,
        take: normalized.pageSize,
        select: directMessageTraceSelect,
      });

      const emails = [
        ...new Set(
          messages.flatMap((message) => [
            message.sender.email.toLowerCase(),
            message.conversation.initiator.email.toLowerCase(),
            message.conversation.recipient.email.toLowerCase(),
          ]),
        ),
      ];
      const registrations =
        emails.length > 0
          ? await tx.registrationRequest.findMany({
              where: { email: { in: emails } },
              select: { email: true, studentId: true },
            })
          : [];
      const studentIdByEmail = new Map(
        registrations.map((registration) => [
          registration.email.toLowerCase(),
          registration.studentId,
        ]),
      );

      return {
        items: messages.map((message) => this.toDto(message, studentIdByEmail)),
        total,
        page: normalized.page,
        pageSize: normalized.pageSize,
        totalPages: Math.ceil(total / normalized.pageSize),
      };
    });
  }

  private toDto(message: TraceMessageRecord, studentIdByEmail: ReadonlyMap<string, string>) {
    const initiator = this.toIdentity(message.conversation.initiator, studentIdByEmail);
    const conversationRecipient = this.toIdentity(message.conversation.recipient, studentIdByEmail);
    const sender = this.toIdentity(message.sender, studentIdByEmail);
    const recipient =
      message.sender.id === message.conversation.initiator.id ? conversationRecipient : initiator;

    return {
      id: String(message.id),
      contentMd: message.contentMd,
      contentHtml: message.contentHtml,
      status: message.status,
      moderationLabels: message.moderationLabels,
      senderIp: message.senderIp,
      senderUserAgent: message.senderUserAgent,
      legalHold: message.legalHold,
      readAt: message.readAt?.toISOString() ?? null,
      createdAt: message.createdAt.toISOString(),
      sender,
      recipient,
      conversation: {
        id: String(message.conversation.id),
        originPostId: message.conversation.originPostId
          ? String(message.conversation.originPostId)
          : null,
        status: message.conversation.status,
        blockedByUserId: message.conversation.blockedById
          ? String(message.conversation.blockedById)
          : null,
        initiator,
        recipient: conversationRecipient,
        lastMessageAt: message.conversation.lastMessageAt.toISOString(),
        createdAt: message.conversation.createdAt.toISOString(),
        updatedAt: message.conversation.updatedAt.toISOString(),
      },
    };
  }

  private toIdentity(
    user: { id: bigint; username: string; email: string },
    studentIdByEmail: ReadonlyMap<string, string>,
  ) {
    return {
      uid: String(user.id),
      username: user.username,
      email: user.email,
      studentId: studentIdByEmail.get(user.email.toLowerCase()) ?? null,
    };
  }

  private buildWhere(query: NormalizedTraceQuery): Prisma.DirectMessageWhereInput {
    return {
      ...(query.messageId ? { id: query.messageId } : {}),
      ...(query.conversationId ? { conversationId: query.conversationId } : {}),
      ...(query.userId
        ? {
            conversation: {
              is: {
                OR: [{ initiatorId: query.userId }, { recipientId: query.userId }],
              },
            },
          }
        : {}),
    };
  }

  private normalizeQuery(query: TraceDirectMessagesQueryDto): NormalizedTraceQuery {
    if (!query.messageId && !query.conversationId && !query.userId) {
      throw new BadRequestException('必须提供 messageId、conversationId 或 userId 精确筛选条件');
    }
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    if (!Number.isInteger(page) || page < 1 || page > 1_000_000) {
      throw new BadRequestException('page 必须是 1 到 1000000 的整数');
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new BadRequestException('pageSize 必须是 1 到 100 的整数');
    }
    return {
      messageId: this.parseFilterId(query.messageId, 'messageId'),
      conversationId: this.parseFilterId(query.conversationId, 'conversationId'),
      userId: this.parseFilterId(query.userId, 'userId'),
      page,
      pageSize,
    };
  }

  private parseFilterId(value: string | undefined, field: string): bigint | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (!/^[1-9]\d{0,18}$/.test(value)) {
      throw new BadRequestException(`${field} 必须是有效的正整数 ID`);
    }
    const parsed = BigInt(value);
    if (parsed > MAX_DATABASE_ID) {
      throw new BadRequestException(`${field} 超出有效 ID 范围`);
    }
    return parsed;
  }

  private parseAdminId(value: string): bigint {
    if (!/^[1-9]\d*$/.test(value)) {
      throw new ForbiddenException('无效的超级管理员身份');
    }
    const parsed = BigInt(value);
    if (parsed > MAX_DATABASE_ID) {
      throw new ForbiddenException('无效的超级管理员身份');
    }
    return parsed;
  }

  private assertSuperadmin(admin: AdminPrincipal): void {
    if (admin.role !== 'superadmin') {
      throw new ForbiddenException('只有超级管理员可以溯源私信真实信息');
    }
  }
}

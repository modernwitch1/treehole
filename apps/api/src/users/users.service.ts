import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PolicyAcceptanceSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { COMMUNITY_RULES_VERSION, NEW_USER_PERIOD_MS } from '../common/community-safety.constants';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentUser(id: bigint) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    if (user.status === 'banned') {
      throw new ForbiddenException('账号已被封禁');
    }
    const isSuspended =
      user.status === 'suspended' && (!user.suspendedUntil || user.suspendedUntil > new Date());
    if (user.status === 'suspended' && user.suspendedUntil && user.suspendedUntil <= new Date()) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'active', suspendedUntil: null },
      });
      await this.prisma.sanction.updateMany({
        where: { userId: user.id, status: 'active', endsAt: { lte: new Date() } },
        data: { status: 'expired' },
      });
    }

    const chinaDayStart = this.chinaDayStart(new Date());
    const [unreadConversations, unreadNotifications, dailyAcknowledgement] = await Promise.all([
      this.prisma.directMessage.count({
        where: {
          senderId: { not: id },
          readAt: null,
          status: 'published',
          conversation: {
            OR: [{ initiatorId: id }, { recipientId: id }],
          },
        },
      }),
      this.prisma.notification.count({ where: { recipientId: id, readAt: null } }),
      this.prisma.policyAcceptance.findFirst({
        where: {
          userId: id,
          policyVersion: COMMUNITY_RULES_VERSION,
          source: 'new_user_daily',
          createdAt: { gte: chinaDayStart },
        },
        select: { createdAt: true },
      }),
    ]);

    const accountAgeMs = Math.max(0, Date.now() - user.createdAt.getTime());
    const isNewUser = accountAgeMs < NEW_USER_PERIOD_MS;

    return {
      id: String(user.id),
      username: user.username,
      avatarUrl: user.avatarUrl ?? undefined,
      bio: user.bio ?? undefined,
      role: user.role,
      accountStatus: isSuspended ? 'suspended' : 'active',
      createdAt: user.createdAt.toISOString(),
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
      unreadNotifications,
      dmAllowed: user.dmAllowed,
      unreadConversations,
      communitySafety: {
        policyVersion: COMMUNITY_RULES_VERSION,
        accountAgeDays: Math.floor(accountAgeMs / (24 * 60 * 60 * 1000)),
        isNewUser,
        acknowledgedToday: Boolean(dailyAcknowledgement),
        shouldPrompt: isNewUser && !dailyAcknowledgement,
        rulesUrl: '/rules',
      },
    };
  }

  async acknowledgeCommunityRules(
    id: bigint,
    input: { version: string; source: PolicyAcceptanceSource },
    ip: string,
    userAgent?: string,
  ) {
    if (input.version !== COMMUNITY_RULES_VERSION) {
      throw new ForbiddenException('社区规则已更新，请刷新页面后重新阅读');
    }
    if (!['new_user_daily', 'publish', 'private_message', 'rules_update'].includes(input.source)) {
      throw new ForbiddenException('无效的确认来源');
    }
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, status: true, suspendedUntil: true },
    });
    if (!user || user.status === 'banned') {
      throw new NotFoundException('用户不存在');
    }

    const created = await this.prisma.policyAcceptance.create({
      data: {
        userId: id,
        policyVersion: COMMUNITY_RULES_VERSION,
        source: input.source,
        ip: ip === 'unknown' ? null : ip,
        userAgent: userAgent?.slice(0, 512),
      },
    });
    return { ok: true, acknowledgedAt: created.createdAt.toISOString() };
  }

  async setDmAllowed(id: bigint, allowed: boolean) {
    await this.prisma.user.update({
      where: { id },
      data: { dmAllowed: Boolean(allowed) },
    });
    return { ok: true };
  }

  private chinaDayStart(now: Date) {
    const offsetMs = 8 * 60 * 60 * 1000;
    const dayMs = 24 * 60 * 60 * 1000;
    return new Date(Math.floor((now.getTime() + offsetMs) / dayMs) * dayMs - offsetMs);
  }
}

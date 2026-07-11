import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';

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
    if (user.status === 'suspended' && (!user.suspendedUntil || user.suspendedUntil > new Date())) {
      throw new ForbiddenException('账号正在禁言中');
    }

    const [unreadConversations, unreadNotifications] = await Promise.all([
      this.prisma.directMessage.count({
        where: {
          senderId: { not: id },
          readAt: null,
          conversation: {
            OR: [{ initiatorId: id }, { recipientId: id }],
          },
        },
      }),
      this.prisma.notification.count({ where: { recipientId: id, readAt: null } }),
    ]);

    return {
      id: String(user.id),
      username: user.username,
      avatarUrl: user.avatarUrl ?? undefined,
      bio: user.bio ?? undefined,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
      unreadNotifications,
      dmAllowed: user.dmAllowed,
      unreadConversations,
    };
  }

  async setDmAllowed(id: bigint, allowed: boolean) {
    await this.prisma.user.update({
      where: { id },
      data: { dmAllowed: Boolean(allowed) },
    });
    return { ok: true };
  }
}

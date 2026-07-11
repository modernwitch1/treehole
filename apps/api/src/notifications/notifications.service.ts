import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';

interface NotificationPayload {
  title?: string;
  body?: string;
  linkUrl?: string;
  announcementId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: bigint, opts?: { cursor?: string }) {
    const pageSize = 30;
    const cursorWhere = opts?.cursor ? { id: { lt: this.parseId(opts.cursor) } } : {};

    const notifications = await this.prisma.notification.findMany({
      where: {
        recipientId: userId,
        ...cursorWhere,
      },
      orderBy: { createdAt: 'desc' },
      take: pageSize + 1,
    });

    const hasMore = notifications.length > pageSize;
    const items = notifications.slice(0, pageSize);

    return {
      items: items.map((notification) => this.toDto(notification)),
      unreadCount: items.filter((notification) => !notification.readAt).length,
      nextCursor: hasMore ? String(items[items.length - 1].id) : undefined,
    };
  }

  async markRead(id: string, userId: bigint) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: this.parseId(id), recipientId: userId },
    });
    if (!notification) {
      throw new NotFoundException('通知不存在');
    }
    await this.prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: notification.readAt ?? new Date() },
    });
    return { ok: true };
  }

  async markAllRead(userId: bigint) {
    await this.prisma.notification.updateMany({
      where: { recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  private toDto(notification: {
    id: bigint;
    type: string;
    payload: unknown;
    readAt: Date | null;
    createdAt: Date;
  }) {
    const payload = this.asPayload(notification.payload);
    return {
      id: String(notification.id),
      type: notification.type,
      title: payload.title ?? '系统通知',
      body: payload.body ?? '',
      linkUrl: payload.linkUrl,
      announcementId: payload.announcementId,
      readAt: notification.readAt?.toISOString() ?? null,
      createdAt: notification.createdAt.toISOString(),
    };
  }

  private asPayload(payload: unknown): NotificationPayload {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {};
    }
    const value = payload as Record<string, unknown>;
    return {
      title: typeof value.title === 'string' ? value.title : undefined,
      body: typeof value.body === 'string' ? value.body : undefined,
      linkUrl: typeof value.linkUrl === 'string' ? value.linkUrl : undefined,
      announcementId: typeof value.announcementId === 'string' ? value.announcementId : undefined,
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

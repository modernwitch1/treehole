import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';

@Injectable()
export class RegistrationService {
  constructor(private readonly prisma: PrismaService) {}

  async list(admin: AdminPrincipal) {
    this.assertAdmin(admin);
    const requests = await this.prisma.registrationRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        reviewer: {
          select: { id: true, username: true },
        },
      },
    });
    return requests.map((r: (typeof requests)[number]) => ({
      id: String(r.id),
      studentId: r.studentId,
      email: r.email,
      username: r.username,
      realName: r.realName,
      screenshotUrl: r.screenshotUrl,
      method: r.method,
      status: r.status.toLowerCase(),
      reviewNote: r.reviewNote,
      reviewedBy: r.reviewer ? { id: String(r.reviewer.id), username: r.reviewer.username } : null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      remainingHours: Math.round((r.expiresAt.getTime() - Date.now()) / 3600000),
    }));
  }

  async review(
    id: string,
    action: 'approve' | 'reject',
    note: string | undefined,
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    this.assertAdmin(admin);
    if (action !== 'approve' && action !== 'reject') {
      throw new BadRequestException('无效的审核操作');
    }
    if (note && note.trim().length > 1000) {
      throw new BadRequestException('审核备注最多 1000 字');
    }
    const requestId = this.parseId(id);
    const request = await this.prisma.registrationRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException('注册申请不存在');
    }
    if (request.status !== 'pending') {
      throw new NotFoundException('该申请已处理');
    }
    if (request.expiresAt <= new Date()) {
      await this.prisma.registrationRequest.update({
        where: { id: request.id },
        data: { status: 'expired' },
      });
      throw new BadRequestException('该申请已过期');
    }

    const status = action === 'approve' ? 'approved' : 'rejected';

    if (action === 'approve') {
      const bannedEmail = await this.prisma.bannedEmail.findUnique({
        where: { email: request.email },
      });
      if (bannedEmail) {
        throw new ConflictException('该邮箱已被封禁，不能通过注册');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.registrationRequest.updateMany({
        where: { id: request.id, status: 'pending', expiresAt: { gt: new Date() } },
        data: {
          status,
          reviewNote: note?.trim() || null,
          reviewedBy: this.parseId(admin.id),
          reviewedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('该申请已处理');
      }

      if (action === 'approve') {
        const existingUser = await tx.user.findUnique({
          where: { email: request.email },
          select: { id: true },
        });
        if (existingUser) {
          throw new ConflictException('该邮箱对应的用户已存在，不能重复审批');
        }

        await tx.user.create({
          data: {
            email: request.email,
            username: request.username,
            passwordHash: request.passwordHash,
            avatarUrl: '/avatar.jpeg',
            emailVerifiedAt: new Date(),
            role: 'user',
            status: 'active',
            termsAcceptedAt: new Date(),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: this.parseId(admin.id),
          action: `registration.${action}`,
          targetType: 'registration',
          targetId: request.id,
          ip,
          userAgent: (Array.isArray(userAgent) ? userAgent.join(', ') : userAgent)?.slice(0, 512),
          metadata: Object.fromEntries(
            Object.entries({
              studentId: request.studentId,
              username: request.username,
              note: note?.trim(),
              actorId: admin.id,
              actorUsername: admin.username,
              actorRole: admin.role,
            }).filter((entry) => entry[1] !== undefined),
          ),
        },
      });
    });

    return { ok: true };
  }

  private assertAdmin(admin: AdminPrincipal): void {
    if (admin.role !== 'admin') {
      throw new ForbiddenException('只有管理员可以审核注册申请');
    }
  }

  private parseId(value: string): bigint {
    try {
      return BigInt(value);
    } catch {
      throw new BadRequestException('无效 ID');
    }
  }
}

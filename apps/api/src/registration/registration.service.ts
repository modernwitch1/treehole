import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';
import { COMMUNITY_RULES_VERSION } from '../common/community-safety.constants';
import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { AppConfig } from '../config/app.config';

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);
  private s3?: S3Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  async list(admin: AdminPrincipal, ip: string, userAgent?: string | string[]) {
    this.assertSuperadmin(admin);
    const requests = await this.prisma.registrationRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        reviewer: {
          select: { id: true, username: true },
        },
      },
    });
    const result = requests.map((r: (typeof requests)[number]) => ({
      id: String(r.id),
      studentId: r.studentId,
      email: r.email,
      username: r.username,
      realName: r.realName,
      screenshotUrl: r.screenshotUrl
        ? `${this.config.get('APP_BASE_URL').replace(/\/+$/, '')}/api/v1/admin/registrations/${r.id}/screenshot`
        : null,
      method: r.method,
      status: r.status.toLowerCase(),
      reviewNote: r.reviewNote,
      reviewedBy: r.reviewer ? { id: String(r.reviewer.id), username: r.reviewer.username } : null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      remainingHours: Math.round((r.expiresAt.getTime() - Date.now()) / 3600000),
    }));
    await this.prisma.auditLog.create({
      data: {
        actorId: this.parseId(admin.id),
        action: 'registration.identity.list',
        targetType: 'registration',
        ip: ip && ip !== 'unknown' ? ip : null,
        userAgent: (Array.isArray(userAgent) ? userAgent.join(', ') : userAgent)?.slice(0, 512),
        metadata: {
          count: result.length,
          actorId: admin.id,
          actorUsername: admin.username,
          actorRole: admin.role,
        },
      },
    });
    return result;
  }

  async review(
    id: string,
    action: 'approve' | 'reject',
    note: string | undefined,
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    this.assertSuperadmin(admin);
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
        const bannedEmail = await tx.bannedEmail.findUnique({ where: { email: request.email } });
        if (bannedEmail) {
          throw new ConflictException('该邮箱已被封禁，不能通过注册');
        }
        if (!request.passwordHash) {
          throw new ConflictException('注册凭据已被清理，请用户重新申请');
        }
        const existingUser = await tx.user.findUnique({
          where: { email: request.email },
          select: { id: true },
        });
        if (existingUser) {
          throw new ConflictException('该邮箱对应的用户已存在，不能重复审批');
        }

        const user = await tx.user.create({
          data: {
            email: request.email,
            username: request.username,
            passwordHash: request.passwordHash,
            avatarUrl: '/avatar.jpeg',
            emailVerifiedAt: new Date(),
            role: 'user',
            status: 'active',
            termsAcceptedAt: request.policyAcceptedAt ?? new Date(),
          },
        });
        await tx.policyAcceptance.create({
          data: {
            userId: user.id,
            policyVersion: request.policyVersion ?? COMMUNITY_RULES_VERSION,
            source: 'registration',
            ip: request.policyAcceptedIp,
            userAgent: request.policyAcceptedUserAgent?.slice(0, 512),
            createdAt: request.policyAcceptedAt ?? new Date(),
          },
        });
      }

      await tx.registrationRequest.update({
        where: { id: request.id },
        data: {
          passwordHash: null,
          verificationCode: null,
          credentialsPurgedAt: new Date(),
        },
      });

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

    if (request.screenshotUrl) {
      await this.purgeReviewedScreenshot(request.id, request.screenshotUrl);
    }

    return { ok: true };
  }

  async screenshot(id: string, admin: AdminPrincipal, ip: string, userAgent?: string | string[]) {
    this.assertSuperadmin(admin);
    const request = await this.prisma.registrationRequest.findUnique({
      where: { id: this.parseId(id) },
      select: { screenshotUrl: true },
    });
    if (!request?.screenshotUrl) {
      throw new NotFoundException('截图不存在');
    }
    const key = this.registrationUploadKey(request.screenshotUrl);
    try {
      const object = await this.getS3Client().send(
        new GetObjectCommand({ Bucket: this.config.get('S3_UPLOADS_BUCKET'), Key: key }),
      );
      if (!object.Body) {
        throw new NotFoundException('截图不存在');
      }
      const result = {
        body: Buffer.from(await object.Body.transformToByteArray()),
        contentType: object.ContentType ?? 'application/octet-stream',
      };
      await this.prisma.auditLog.create({
        data: {
          actorId: this.parseId(admin.id),
          action: 'registration.screenshot.view',
          targetType: 'registration',
          targetId: this.parseId(id),
          ip: ip && ip !== 'unknown' ? ip : null,
          userAgent: (Array.isArray(userAgent) ? userAgent.join(', ') : userAgent)?.slice(0, 512),
          metadata: {
            actorId: admin.id,
            actorUsername: admin.username,
            actorRole: admin.role,
          },
        },
      });
      return result;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new NotFoundException('截图不存在');
    }
  }

  private assertSuperadmin(admin: AdminPrincipal): void {
    // Registration records contain a student number, e-mail address, real name
    // and (before it is purged) a verification screenshot.  Treat the whole
    // workflow as an identity-disclosure surface instead of relying on the UI
    // to hide individual fields from lower-privileged staff.
    if (admin.role !== 'superadmin') {
      throw new ForbiddenException('只有超级管理员可以查看和审核注册身份资料');
    }
  }

  private parseId(value: string): bigint {
    try {
      return BigInt(value);
    } catch {
      throw new BadRequestException('无效 ID');
    }
  }

  private registrationUploadKey(value: string): string {
    try {
      const base = new URL(`${this.config.get('CDN_BASE_URL').replace(/\/+$/, '')}/`);
      const url = new URL(value);
      if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
        throw new Error();
      }
      const key = url.pathname.slice(base.pathname.length);
      if (!/^registrations\/[A-Za-z0-9_-]+\.(?:jpg|png)$/.test(key)) {
        throw new Error();
      }
      return key;
    } catch {
      throw new NotFoundException('截图不存在');
    }
  }

  private async purgeReviewedScreenshot(requestId: bigint, screenshotUrl: string) {
    try {
      await this.getS3Client().send(
        new DeleteObjectCommand({
          Bucket: this.config.get('S3_UPLOADS_BUCKET'),
          Key: this.registrationUploadKey(screenshotUrl),
        }),
      );
      await this.prisma.registrationRequest.update({
        where: { id: requestId },
        data: { screenshotUrl: null, realName: null },
      });
    } catch (error) {
      this.logger.error(
        `Failed to purge reviewed registration screenshot for request ${requestId}: ${String(error)}`,
      );
    }
  }

  private getS3Client() {
    this.s3 ??= new S3Client({
      region: this.config.get('AWS_REGION'),
      endpoint: this.config.get('S3_ENDPOINT') || undefined,
      forcePathStyle: this.config.get('S3_FORCE_PATH_STYLE'),
    });
    return this.s3;
  }
}

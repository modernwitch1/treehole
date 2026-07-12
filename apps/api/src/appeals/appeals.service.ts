import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { RateLimitService } from '../common/security/rate-limit.service';

@Injectable()
export class AppealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async listMySanctions(userId: bigint) {
    await this.expireFinishedSanctions(userId);
    const sanctions = await this.prisma.sanction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        appeals: {
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            reason: true,
            status: true,
            reviewNote: true,
            reviewedAt: true,
            createdAt: true,
          },
        },
      },
    });
    return {
      items: sanctions.map((sanction) => ({
        id: String(sanction.id),
        caseId: sanction.caseId ? String(sanction.caseId) : null,
        type: sanction.type,
        status: sanction.status,
        scope: sanction.scope,
        policyRule: sanction.policyRule,
        reason: sanction.reason,
        startsAt: sanction.startsAt.toISOString(),
        endsAt: sanction.endsAt?.toISOString() ?? null,
        revokedAt: sanction.revokedAt?.toISOString() ?? null,
        revokeNote: sanction.revokeNote,
        createdAt: sanction.createdAt.toISOString(),
        appeal: sanction.appeals[0]
          ? {
              id: String(sanction.appeals[0].id),
              reason: sanction.appeals[0].reason,
              status: sanction.appeals[0].status,
              reviewNote: sanction.appeals[0].reviewNote,
              reviewedAt: sanction.appeals[0].reviewedAt?.toISOString() ?? null,
              createdAt: sanction.appeals[0].createdAt.toISOString(),
            }
          : null,
      })),
    };
  }

  async createAppeal(
    userId: bigint,
    sanctionIdValue: string,
    reasonValue: string,
    ip: string,
    userAgent?: string,
  ) {
    await this.rateLimit.consume(
      'appeal-user',
      String(userId),
      3,
      24 * 3600,
      '申诉提交过于频繁，请稍后再试',
    );
    const reason = reasonValue.trim();
    if (reason.length < 20 || reason.length > 2000) {
      throw new BadRequestException('申诉理由须为 20 到 2000 个字');
    }
    const sanctionId = this.parseId(sanctionIdValue);
    await this.expireFinishedSanctions(userId);
    const sanction = await this.prisma.sanction.findFirst({
      where: { id: sanctionId, userId },
      select: { id: true, status: true, createdAt: true },
    });
    if (!sanction) {
      throw new NotFoundException('处罚记录不存在');
    }
    if (sanction.status === 'revoked') {
      throw new BadRequestException('该处罚已经撤销，无需再次申诉');
    }

    try {
      const appeal = await this.prisma.$transaction(async (tx) => {
        const created = await tx.appeal.create({
          data: { sanctionId, userId, reason },
        });
        await tx.auditLog.create({
          data: {
            actorId: userId,
            action: 'appeal.submit',
            targetType: 'appeal',
            targetId: created.id,
            ip: ip && ip !== 'unknown' ? ip : null,
            userAgent: userAgent?.slice(0, 512),
            // Do not duplicate the sensitive appeal narrative in audit metadata.
            metadata: { sanctionId: String(sanctionId) },
          },
        });
        return created;
      });
      return {
        ok: true,
        appeal: {
          id: String(appeal.id),
          status: appeal.status,
          createdAt: appeal.createdAt.toISOString(),
        },
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('该处罚已经提交过申诉，请等待复核结果');
      }
      throw error;
    }
  }

  private async expireFinishedSanctions(userId: bigint) {
    await this.prisma.sanction.updateMany({
      where: { userId, status: 'active', endsAt: { lte: new Date() } },
      data: { status: 'expired' },
    });
  }

  private parseId(value: string) {
    try {
      const id = BigInt(value);
      if (id <= 0n) {
        throw new Error('invalid');
      }
      return id;
    } catch {
      throw new BadRequestException('无效的处罚记录 ID');
    }
  }
}

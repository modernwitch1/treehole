import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { RateLimitService } from '../common/security/rate-limit.service';
import { hotScoreFor } from '../posts';

export type ReactionTarget = 'post' | 'comment';
export type ReactionValue = 1 | -1 | 0;

@Injectable()
export class ReactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async vote(targetType: ReactionTarget, targetId: string, value: ReactionValue, userId: bigint) {
    await this.rateLimit.consume('vote-user', String(userId), 120, 60);
    if (targetType !== 'post' && targetType !== 'comment') {
      throw new BadRequestException('无效投票目标');
    }
    if (value !== -1 && value !== 0 && value !== 1) {
      throw new BadRequestException('无效投票值');
    }
    if (targetType === 'post' && value === -1) {
      throw new BadRequestException('帖子仅支持点赞或取消点赞');
    }

    const user = await this.getActiveAuthor(userId);
    const id = this.parseId(targetId);
    if (targetType === 'post') {
      const post = await this.prisma.post.findFirst({ where: { id, status: 'published' } });
      if (!post) {
        throw new NotFoundException('帖子不存在');
      }
    } else {
      const comment = await this.prisma.comment.findFirst({ where: { id, status: 'published' } });
      if (!comment) {
        throw new NotFoundException('评论不存在');
      }
    }

    const counts = await this.prisma.$transaction(async (tx) => {
      if (value === 0) {
        await tx.vote.deleteMany({ where: { userId: user.id, targetType, targetId: id } });
      } else {
        await tx.vote.upsert({
          where: { userId_targetType_targetId: { userId: user.id, targetType, targetId: id } },
          update: { value },
          create: { userId: user.id, targetType, targetId: id, value },
        });
      }

      // Recalculate from the fact table so retries and concurrent requests do
      // not increment denormalized counters more than once.
      const grouped = await tx.vote.groupBy({
        by: ['value'],
        where: { targetType, targetId: id },
        _count: { _all: true },
      });
      const upvotes = grouped.find((group) => group.value === 1)?._count._all ?? 0;
      const downvotes =
        targetType === 'post' ? 0 : (grouped.find((group) => group.value === -1)?._count._all ?? 0);
      const score = upvotes - downvotes;

      if (targetType === 'post') {
        const post = await tx.post.findUniqueOrThrow({
          where: { id },
          select: { createdAt: true },
        });
        await tx.post.update({
          where: { id },
          data: {
            upvotes,
            downvotes,
            score,
            hotScore: hotScoreFor(score, post.createdAt),
          },
        });
      } else {
        await tx.comment.update({
          where: { id },
          data: { upvotes, downvotes, score },
        });
      }
      return { upvotes, downvotes, score };
    });

    return { ok: true, ...counts };
  }

  private async getActiveAuthor(userId: bigint) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    if (user.status === 'banned') {
      throw new ForbiddenException('账号已被封禁');
    }
    if (user.status === 'suspended' && (!user.suspendedUntil || user.suspendedUntil > new Date())) {
      throw new ForbiddenException('账号正在禁言中');
    }
    return user;
  }

  private parseId(id: string): bigint {
    try {
      return BigInt(id);
    } catch {
      throw new BadRequestException('无效 ID');
    }
  }
}

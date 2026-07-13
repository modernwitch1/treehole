import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.module';
import type { RateLimitService } from '../common/security/rate-limit.service';
import { ReactionsService } from './reactions.service';

describe('ReactionsService', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    post: { findFirst: jest.fn() },
    comment: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  } as unknown as PrismaService;
  const rateLimit = {
    consume: jest.fn().mockResolvedValue(undefined),
  } as unknown as RateLimitService;
  let service: ReactionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReactionsService(prisma, rateLimit);
  });

  it('rejects unsupported values before touching content state', async () => {
    await expect(service.vote('post', '10', 2 as 1, 1n)).rejects.toThrow(BadRequestException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('recalculates post counters from the vote fact table in a transaction', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 1n,
      status: 'active',
      suspendedUntil: null,
    });
    (prisma.post.findFirst as jest.Mock).mockResolvedValue({ id: 10n, status: 'published' });
    const transactionClient = {
      vote: {
        upsert: jest.fn().mockResolvedValue({}),
        groupBy: jest.fn().mockResolvedValue([{ value: 1, _count: { _all: 3 } }]),
      },
      post: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(transactionClient),
    );

    await expect(service.vote('post', '10', 1, 1n)).resolves.toEqual({
      ok: true,
      upvotes: 3,
      downvotes: 0,
      score: 3,
    });
    expect(transactionClient.vote.upsert).toHaveBeenCalledWith({
      where: { userId_targetType_targetId: { userId: 1n, targetType: 'post', targetId: 10n } },
      update: { value: 1 },
      create: { userId: 1n, targetType: 'post', targetId: 10n, value: 1 },
    });
    expect(transactionClient.post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10n },
        data: expect.objectContaining({ upvotes: 3, downvotes: 0, score: 3 }),
      }),
    );
  });

  it('allows downvotes for comments but not posts', async () => {
    await expect(service.vote('post', '10', -1, 1n)).rejects.toThrow(BadRequestException);

    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 1n,
      status: 'active',
      suspendedUntil: null,
    });
    (prisma.comment.findFirst as jest.Mock).mockResolvedValue({ id: 10n, status: 'published' });
    const transactionClient = {
      vote: {
        upsert: jest.fn().mockResolvedValue({}),
        groupBy: jest.fn().mockResolvedValue([{ value: -1, _count: { _all: 2 } }]),
      },
      comment: { update: jest.fn().mockResolvedValue({}) },
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(transactionClient),
    );

    await expect(service.vote('comment', '10', -1, 1n)).resolves.toEqual({
      ok: true,
      upvotes: 0,
      downvotes: 2,
      score: -2,
    });
    expect(transactionClient.comment.update).toHaveBeenCalledWith({
      where: { id: 10n },
      data: { upvotes: 0, downvotes: 2, score: -2 },
    });
  });
});

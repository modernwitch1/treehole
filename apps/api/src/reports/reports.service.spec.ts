import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.module';
import type { RateLimitService } from '../common/security/rate-limit.service';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    post: { findFirst: jest.fn(), updateMany: jest.fn() },
    report: { count: jest.fn() },
    $transaction: jest.fn(),
  } as unknown as PrismaService;
  const rateLimit = {
    consume: jest.fn().mockResolvedValue(undefined),
  } as unknown as RateLimitService;
  let service: ReportsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReportsService(prisma, rateLimit);
  });

  it('rejects an invalid category before loading report evidence', async () => {
    await expect(
      service.reportTarget({
        reporterId: 1n,
        targetType: 'post',
        targetId: '10',
        category: 'unknown' as 'other',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.post.findFirst).not.toHaveBeenCalled();
  });

  it('stores an evidence snapshot and legal hold in one transaction', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 1n,
      status: 'active',
      suspendedUntil: null,
    });
    (prisma.post.findFirst as jest.Mock).mockResolvedValue({
      id: 10n,
      title: '违规标题',
      contentMd: '违规内容',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      boardId: 2n,
    });
    (prisma.report.count as jest.Mock).mockResolvedValue(3);
    const transactionClient = {
      report: { create: jest.fn().mockResolvedValue({ id: 99n }) },
      post: { update: jest.fn().mockResolvedValue({}) },
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(transactionClient),
    );

    await expect(
      service.reportTarget({
        reporterId: 1n,
        targetType: 'post',
        targetId: '10',
        category: 'illegal',
        reason: '严重违规',
      }),
    ).resolves.toEqual({ ok: true });

    expect(transactionClient.report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reporterId: 1n,
          targetType: 'post',
          targetId: 10n,
          category: 'illegal',
          priority: 100,
          legalHold: true,
          evidenceSnapshot: expect.objectContaining({
            type: 'post',
            id: '10',
            content: '违规内容',
          }),
        }),
      }),
    );
    expect(transactionClient.post.update).toHaveBeenCalledWith({
      where: { id: 10n },
      data: { legalHold: true },
    });
    expect(prisma.post.updateMany).toHaveBeenCalledWith({
      where: { id: 10n, status: 'published' },
      data: { status: 'pending_review', legalHold: true },
    });
  });

  it('does not allow reporting oneself as a user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 1n,
      status: 'active',
      suspendedUntil: null,
    });

    await expect(
      service.reportTarget({
        reporterId: 1n,
        targetType: 'user',
        targetId: '1',
        category: 'other',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

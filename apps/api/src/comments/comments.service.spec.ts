import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.module';
import type { ModerationService } from '../common/moderation.service';
import type { RateLimitService } from '../common/security/rate-limit.service';
import { CommentsService } from './comments.service';

function commentRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 1n,
    postId: 10n,
    parentId: null,
    author: { id: 1n, username: 'alice', avatarUrl: null },
    contentMd: '评论内容',
    contentHtml: '<p>评论内容</p>',
    isAnonymous: true,
    status: 'published',
    upvotes: 0,
    downvotes: 0,
    score: 0,
    depth: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('CommentsService', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    post: { findFirst: jest.fn() },
    comment: { findFirst: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  } as unknown as PrismaService;
  const moderation = {
    moderateOrThrow: jest.fn(),
    moderationLabels: jest.fn().mockReturnValue([]),
    recordCase: jest.fn().mockResolvedValue({}),
  } as unknown as ModerationService;
  const rateLimit = {
    consume: jest.fn().mockResolvedValue(undefined),
  } as unknown as RateLimitService;
  let service: CommentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CommentsService(prisma, moderation, rateLimit);
  });

  it('requires community-rule acknowledgement before reading post state', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 1n,
      status: 'active',
      suspendedUntil: null,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    await expect(
      service.createComment({
        postId: '10',
        contentMd: '评论',
        isAnonymous: true,
        authorId: 1n,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.post.findFirst).not.toHaveBeenCalled();
  });

  it('creates a comment, increments the post, and emits the notification transactionally', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 1n,
      status: 'active',
      suspendedUntil: null,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    (prisma.post.findFirst as jest.Mock).mockResolvedValue({
      id: 10n,
      authorId: 20n,
      isLocked: false,
      board: { allowsAnonymous: true },
    });
    (moderation.moderateOrThrow as jest.Mock).mockResolvedValue({
      content: '评论',
      status: 'published',
      blocked: false,
      matches: [],
      reasonCodes: [],
      riskLevel: 0,
      contentHash: 'hash',
    });
    const created = commentRecord();
    const transactionClient = {
      comment: { create: jest.fn().mockResolvedValue(created) },
      post: { update: jest.fn().mockResolvedValue({}) },
      notification: { create: jest.fn().mockResolvedValue({}) },
      policyAcceptance: { create: jest.fn().mockResolvedValue({}) },
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(transactionClient),
    );

    const result = await service.createComment({
      postId: '10',
      contentMd: '评论',
      isAnonymous: true,
      authorId: 1n,
      rulesAcknowledged: true,
    });

    expect(result).toMatchObject({
      id: '1',
      postId: '10',
      author: { type: 'anonymous', pseudonym: { displayName: '浙小商' } },
    });
    expect(transactionClient.post.update).toHaveBeenCalledWith({
      where: { id: 10n },
      data: { commentCount: { increment: 1 } },
    });
    expect(transactionClient.notification.create).toHaveBeenCalledTimes(1);
    expect(transactionClient.policyAcceptance.create).toHaveBeenCalledTimes(1);
  });

  it('builds a bounded three-level reply tree', async () => {
    (prisma.post.findFirst as jest.Mock).mockResolvedValue({ id: 10n });
    (prisma.comment.findMany as jest.Mock)
      .mockResolvedValueOnce([commentRecord()])
      .mockResolvedValueOnce([
        commentRecord({
          id: 2n,
          parentId: 1n,
          depth: 1,
          contentMd: '回复',
          contentHtml: '<p>回复</p>',
        }),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.listComments('10');

    expect(result).toMatchObject({
      items: [
        {
          id: '1',
          replies: [{ id: '2', parentId: '1', contentMd: '回复' }],
        },
      ],
    });
    expect(prisma.comment.findMany).toHaveBeenCalledTimes(3);
  });

  it('does not allow replies below the three-level limit', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 1n,
      status: 'active',
      suspendedUntil: null,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    (prisma.post.findFirst as jest.Mock).mockResolvedValue({
      id: 10n,
      isLocked: false,
      board: { allowsAnonymous: true },
    });
    (prisma.comment.findFirst as jest.Mock).mockResolvedValue(
      commentRecord({ id: 4n, parentId: 3n, depth: 3 }),
    );

    await expect(
      service.createComment({
        postId: '10',
        parentId: '4',
        contentMd: '再回复一层',
        isAnonymous: true,
        authorId: 1n,
        rulesAcknowledged: true,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(moderation.moderateOrThrow).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps a moderated comment pending without counting or notifying it', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 1n,
      status: 'active',
      suspendedUntil: null,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    (prisma.post.findFirst as jest.Mock).mockResolvedValue({
      id: 10n,
      authorId: 20n,
      isLocked: false,
      board: { allowsAnonymous: true },
    });
    (moderation.moderateOrThrow as jest.Mock).mockResolvedValue({
      content: '待审核评论',
      status: 'pending_review',
      blocked: false,
      matches: [],
      reasonCodes: ['manual_review'],
      riskLevel: 3,
      contentHash: 'hash',
    });
    const created = commentRecord({
      status: 'pending_review',
      contentMd: '待审核评论',
      contentHtml: '<p>待审核评论</p>',
    });
    const transactionClient = {
      comment: { create: jest.fn().mockResolvedValue(created) },
      post: { update: jest.fn().mockResolvedValue({}) },
      notification: { create: jest.fn().mockResolvedValue({}) },
      policyAcceptance: { create: jest.fn().mockResolvedValue({}) },
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(transactionClient),
    );

    const result = await service.createComment({
      postId: '10',
      contentMd: '待审核评论',
      isAnonymous: true,
      authorId: 1n,
      rulesAcknowledged: true,
    });

    expect(result.status).toBe('pending_review');
    expect(transactionClient.post.update).not.toHaveBeenCalled();
    expect(transactionClient.notification.create).not.toHaveBeenCalled();
    expect(moderation.recordCase).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending_review' }),
      expect.objectContaining({ surface: 'comment' }),
      1n,
      '待审核评论',
    );
  });
});

import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.module';
import type { AppConfig } from '../config/app.config';
import type { ModerationService } from '../common/moderation.service';
import type { RateLimitService } from '../common/security/rate-limit.service';
import { PostsCommandService } from './posts-command.service';

describe('PostsCommandService', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    board: { findUnique: jest.fn() },
    post: { findFirst: jest.fn(), create: jest.fn() },
    upload: { findMany: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  } as unknown as PrismaService;
  const config = {
    get: jest.fn().mockReturnValue('https://storage.example.test'),
  } as unknown as AppConfig;
  const moderation = {
    moderateOrThrow: jest.fn(),
    moderationLabels: jest.fn().mockReturnValue([]),
    recordCase: jest.fn().mockResolvedValue({}),
  } as unknown as ModerationService;
  const rateLimit = {
    consume: jest.fn().mockResolvedValue(undefined),
  } as unknown as RateLimitService;
  let service: PostsCommandService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PostsCommandService(prisma, config, moderation, rateLimit);
  });

  it('requires community-rule acknowledgement before reading content state', async () => {
    await expect(
      service.createPost({
        title: '标题',
        contentMd: '正文',
        boardSlug: 'campus',
        authorId: 1n,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('creates the post and policy acceptance in one transaction', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 1n,
      status: 'active',
      suspendedUntil: null,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    (prisma.board.findUnique as jest.Mock).mockResolvedValue({
      id: 2n,
      status: 'active',
    });
    (prisma.upload.findMany as jest.Mock).mockResolvedValue([
      { s3Key: 'posts/photo_1.jpg', moderationStatus: 'passed' },
    ]);
    (moderation.moderateOrThrow as jest.Mock).mockImplementation(async (content: string) => ({
      content,
      status: 'published',
      blocked: false,
      matches: [],
      reasonCodes: [],
      riskLevel: 0,
      contentHash: 'hash',
    }));
    const created = {
      id: 9n,
      board: { slug: 'campus', name: '校园', icon: '🌳' },
      author: { id: 1n, username: 'alice', avatarUrl: null },
      title: '标题',
      contentMd: '正文\n\n![帖子图片 1](/api/v1/uploads/public/posts/photo_1.jpg)',
      contentHtml: '<p>正文</p><p><img src="/api/v1/uploads/public/posts/photo_1.jpg"></p>',
      isAnonymous: true,
      upvotes: 0,
      downvotes: 0,
      score: 0,
      createdAt,
    };
    const transactionClient = {
      post: { create: jest.fn().mockResolvedValue(created) },
      policyAcceptance: { create: jest.fn().mockResolvedValue({ id: 1n }) },
      upload: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(transactionClient),
    );

    const result = await service.createPost({
      title: '标题',
      contentMd: '正文',
      boardSlug: 'campus',
      authorId: 1n,
      rulesAcknowledged: true,
      imageUrls: ['/api/v1/uploads/public/posts/photo_1.jpg'],
    });

    expect(result).toMatchObject({
      id: '9',
      title: '标题',
      imageUrls: ['/api/v1/uploads/public/posts/photo_1.jpg'],
      author: { type: 'anonymous' },
    });
    expect(transactionClient.post.create).toHaveBeenCalledTimes(1);
    expect(transactionClient.policyAcceptance.create).toHaveBeenCalledTimes(1);
    expect(transactionClient.upload.updateMany).toHaveBeenCalledWith({
      where: { userId: 1n, s3Key: { in: ['posts/photo_1.jpg'] } },
      data: { attachedToType: 'post', attachedToId: 9n },
    });
  });

  it('keeps posts with pending media out of the public feed and records a case', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 1n,
      status: 'active',
      suspendedUntil: null,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    (prisma.board.findUnique as jest.Mock).mockResolvedValue({
      id: 2n,
      status: 'active',
    });
    (prisma.upload.findMany as jest.Mock).mockResolvedValue([
      { s3Key: 'posts/photo_1.jpg', moderationStatus: 'pending' },
    ]);
    (moderation.moderateOrThrow as jest.Mock).mockImplementation(async (content: string) => ({
      content,
      status: 'published',
      blocked: false,
      matches: [],
      reasonCodes: [],
      riskLevel: 0,
      contentHash: 'hash',
    }));
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const created = {
      id: 10n,
      board: { slug: 'campus', name: '校园', icon: '🌳' },
      author: { id: 1n, username: 'alice', avatarUrl: null },
      title: '标题',
      contentMd: '正文\n\n![帖子图片 1](/api/v1/uploads/public/posts/photo_1.jpg)',
      contentHtml: '<p>正文</p>',
      isAnonymous: true,
      status: 'pending_review',
      upvotes: 0,
      downvotes: 0,
      score: 0,
      createdAt,
    };
    const transactionClient = {
      post: { create: jest.fn().mockResolvedValue(created) },
      policyAcceptance: { create: jest.fn().mockResolvedValue({ id: 1n }) },
      upload: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(transactionClient),
    );

    const result = await service.createPost({
      title: '标题',
      contentMd: '正文',
      boardSlug: 'campus',
      authorId: 1n,
      rulesAcknowledged: true,
      imageUrls: ['/api/v1/uploads/public/posts/photo_1.jpg'],
    });

    expect(result.status).toBe('pending_review');
    expect(transactionClient.post.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'pending_review' }),
      }),
    );
    expect(moderation.recordCase).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending_review', reasonCodes: ['image_pending_review'] }),
      expect.objectContaining({ surface: 'post' }),
      10n,
      '标题\n正文',
    );
  });
});

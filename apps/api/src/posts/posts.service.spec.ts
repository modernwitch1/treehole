import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.module';
import { PostsService } from './posts.service';

describe('PostsService', () => {
  const prisma = {
    board: { findFirst: jest.fn() },
    post: { findMany: jest.fn(), findFirst: jest.fn() },
    vote: { findMany: jest.fn(), findUnique: jest.fn() },
  } as unknown as PrismaService;
  let service: PostsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PostsService(prisma);
  });

  it('validates search and cursor before querying the database', async () => {
    await expect(service.listPosts({ q: 'a'.repeat(101) })).rejects.toThrow(BadRequestException);
    await expect(service.listPosts({ cursor: 'not-a-number' })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.board.findFirst).not.toHaveBeenCalled();
    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });

  it('returns an empty page when the requested board does not exist', async () => {
    (prisma.board.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(service.listPosts({ boardSlug: 'missing' })).resolves.toEqual({ items: [] });
    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });

  it('maps anonymous posts, media URLs, and the current user vote', async () => {
    (prisma.board.findFirst as jest.Mock).mockResolvedValue({ id: 2n });
    (prisma.post.findMany as jest.Mock).mockResolvedValue([
      {
        id: 10n,
        authorId: 5n,
        title: '校园生活',
        contentMd: '正文\n\n![帖子图片](/posts/photo_1.jpg)',
        isAnonymous: true,
        upvotes: 3,
        downvotes: 1,
        score: 2,
        commentCount: 4,
        isLocked: false,
        isPinned: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        board: { slug: 'campus', name: '校园', icon: '🌳' },
        author: { id: 5n, username: 'hidden-user', avatarUrl: null },
        quotedPost: null,
      },
    ]);
    (prisma.vote.findMany as jest.Mock).mockResolvedValue([{ targetId: 10n }]);

    const result = await service.listPosts({ boardSlug: 'campus', userId: 8n, limit: '1' });

    expect(result).toMatchObject({
      items: [
        {
          id: '10',
          author: {
            type: 'anonymous',
            pseudonym: { displayName: '浙小商', isOp: true },
          },
          imageUrls: ['/api/v1/uploads/public/posts/photo_1.jpg'],
          thumbnailUrl: '/api/v1/uploads/public/posts/photo_1.jpg',
          myVote: 1,
        },
      ],
    });
    expect(result.nextCursor).toBeUndefined();
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2, skip: 0 }),
    );
  });
});

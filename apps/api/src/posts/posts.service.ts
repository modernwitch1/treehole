import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type ContentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { imageUrlsForPostContent, normalizePostMedia } from './post-media';

type QuotedPostPreview = {
  id: string;
  title: string;
  contentExcerpt: string;
  board: { slug: string; name: string };
};

export type PostListOptions = {
  boardSlug?: string;
  sort?: string;
  cursor?: string;
  q?: string;
  limit?: string;
  userId?: bigint;
};

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPosts(opts: PostListOptions) {
    const { boardSlug, sort = 'hot', cursor } = opts;
    const requestedLimit = Number.parseInt(opts.limit ?? '', 10);
    const pageSize = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 30)
      : 20;
    const query = opts.q?.trim();
    if (query && query.length > 100) {
      throw new BadRequestException('搜索关键词最多 100 字');
    }

    let cursorId: bigint | undefined;
    if (cursor) {
      try {
        cursorId = BigInt(cursor);
        if (cursorId <= 0n) {
          throw new Error('invalid cursor');
        }
      } catch {
        throw new BadRequestException('分页游标无效');
      }
    }

    const board = boardSlug
      ? await this.prisma.board.findFirst({
          where: { OR: [{ slug: boardSlug }, { name: boardSlug }] },
          select: { id: true },
        })
      : null;
    if (boardSlug && !board) {
      return { items: [] };
    }

    const orderBy: Prisma.PostOrderByWithRelationInput =
      sort === 'new'
        ? { createdAt: 'desc' }
        : sort === 'top'
          ? { score: 'desc' }
          : { hotScore: 'desc' };

    const posts = await this.prisma.post.findMany({
      where: {
        ...(board ? { boardId: board.id } : {}),
        status: 'published',
        ...(query
          ? {
              OR: [
                { title: { contains: query, mode: 'insensitive' } },
                { contentMd: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      cursor: cursorId ? { id: cursorId } : undefined,
      skip: cursorId ? 1 : 0,
      orderBy: [{ isPinned: 'desc' }, orderBy, { id: 'desc' }],
      take: pageSize + 1,
      select: {
        id: true,
        authorId: true,
        title: true,
        contentMd: true,
        isAnonymous: true,
        upvotes: true,
        downvotes: true,
        score: true,
        commentCount: true,
        isLocked: true,
        isPinned: true,
        createdAt: true,
        board: { select: { slug: true, name: true, icon: true } },
        author: { select: { id: true, username: true, avatarUrl: true } },
        quotedPost: {
          select: {
            id: true,
            title: true,
            contentMd: true,
            status: true,
            board: { select: { slug: true, name: true } },
          },
        },
      },
    });

    const hasMore = posts.length > pageSize;
    const items = posts.slice(0, pageSize);
    const likedPostIds =
      opts.userId && items.length > 0
        ? new Set(
            (
              await this.prisma.vote.findMany({
                where: {
                  userId: opts.userId,
                  targetType: 'post',
                  targetId: { in: items.map((post) => post.id) },
                  value: 1,
                },
                select: { targetId: true },
              })
            ).map((vote) => String(vote.targetId)),
          )
        : new Set<string>();

    return {
      items: items.map((p) => {
        const imageUrls = imageUrlsForPostContent(p.contentMd);
        return {
          id: String(p.id),
          board: {
            slug: p.board.slug,
            name: p.board.name,
            icon: p.board.icon,
          },
          author: p.isAnonymous
            ? {
                type: 'anonymous',
                pseudonym: this.pseudonymFor(p.id, p.author.id, p.author.id === p.authorId),
              }
            : {
                type: 'user',
                user: {
                  id: String(p.author.id),
                  username: p.author.username,
                  avatarUrl: p.author.avatarUrl,
                },
              },
          title: p.title,
          contentExcerpt: this.contentExcerpt(p.contentMd),
          imageUrls,
          thumbnailUrl: imageUrls[0],
          hasImages: imageUrls.length > 0,
          quotedPost: this.quotedPostPreview(p.quotedPost),
          upvotes: p.upvotes,
          downvotes: p.downvotes,
          score: p.score,
          myVote: likedPostIds.has(String(p.id)) ? 1 : 0,
          commentCount: p.commentCount,
          isLocked: p.isLocked,
          isPinned: p.isPinned,
          createdAt: p.createdAt.toISOString(),
        };
      }),
      nextCursor: hasMore ? String(items[items.length - 1].id) : undefined,
    };
  }

  async getPost(id: string, userId?: bigint) {
    const postId = this.parseId(id);
    const post = await this.prisma.post.findFirst({
      where: { id: postId, status: 'published' },
      include: {
        board: true,
        author: { select: { id: true, username: true, avatarUrl: true } },
        quotedPost: {
          select: {
            id: true,
            title: true,
            contentMd: true,
            status: true,
            board: { select: { slug: true, name: true } },
          },
        },
      },
    });
    if (!post) {
      throw new NotFoundException('帖子不存在');
    }

    const imageUrls = imageUrlsForPostContent(post.contentMd);
    const liked = userId
      ? await this.prisma.vote.findUnique({
          where: {
            userId_targetType_targetId: { userId, targetType: 'post', targetId: post.id },
          },
          select: { value: true },
        })
      : null;

    return {
      id: String(post.id),
      board: {
        slug: post.board.slug,
        name: post.board.name,
        icon: post.board.icon,
      },
      author: post.isAnonymous
        ? {
            type: 'anonymous',
            pseudonym: this.pseudonymFor(post.id, post.author.id, post.author.id === post.authorId),
          }
        : {
            type: 'user',
            user: {
              id: String(post.author.id),
              username: post.author.username,
              avatarUrl: post.author.avatarUrl,
            },
          },
      title: post.title,
      contentMd: normalizePostMedia(post.contentMd),
      contentHtml: normalizePostMedia(post.contentHtml),
      imageUrls,
      thumbnailUrl: imageUrls[0],
      hasImages: imageUrls.length > 0,
      quotedPost: this.quotedPostPreview(post.quotedPost),
      upvotes: post.upvotes,
      downvotes: post.downvotes,
      score: post.score,
      myVote: liked?.value === 1 ? 1 : 0,
      commentCount: post.commentCount,
      isLocked: post.isLocked,
      isPinned: post.isPinned,
      createdAt: post.createdAt.toISOString(),
    };
  }

  private contentExcerpt(contentMd: string): string {
    return contentMd
      .replace(/!\[[^\]]*]\([^)]+\)/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
  }

  private quotedPostPreview(
    post: {
      id: bigint;
      title: string;
      contentMd: string;
      status: ContentStatus;
      board: { slug: string; name: string };
    } | null,
  ): QuotedPostPreview | undefined {
    if (!post || post.status !== 'published') {
      return undefined;
    }
    return {
      id: String(post.id),
      title: post.title,
      contentExcerpt: this.contentExcerpt(post.contentMd).slice(0, 120),
      board: post.board,
    };
  }

  private pseudonymFor(_postId: bigint, _userId: bigint, isOp: boolean) {
    return {
      displayName: '浙小商',
      color: 'hsl(24 90% 52%)',
      isOp,
    };
  }

  private parseId(id: string): bigint {
    try {
      const parsed = BigInt(id);
      if (parsed <= 0n) {
        throw new Error('invalid id');
      }
      return parsed;
    } catch {
      throw new BadRequestException('无效 ID');
    }
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ContentStatus, Prisma } from '@prisma/client';
import { createHmac } from 'crypto';
import MarkdownIt from 'markdown-it';
import { PrismaService } from '../prisma/prisma.module';
import { AppConfig } from '../config/app.config';
import { ModerationService } from '../common/moderation.service';
import { RateLimitService } from '../common/security/rate-limit.service';

type ApiAuthor =
  | { type: 'anonymous'; pseudonym: { displayName: string; color: string; isOp: boolean } }
  | { type: 'user'; user: { id: string; username: string; avatarUrl: string | null } };

export interface CommentItem {
  id: string;
  postId: string;
  parentId?: string;
  author: ApiAuthor;
  contentMd: string;
  contentHtml: string;
  upvotes: number;
  downvotes: number;
  score: number;
  isDeleted: boolean;
  depth: number;
  createdAt: string;
  replies?: CommentItem[];
}

@Injectable()
export class ContentService {
  private readonly markdown = new MarkdownIt({ html: false, linkify: true, breaks: true });

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly moderation: ModerationService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async listPosts(opts: {
    boardSlug?: string;
    sort?: string;
    cursor?: string;
    q?: string;
    limit?: string;
  }) {
    const { boardSlug, sort = 'hot', cursor } = opts;
    const requestedLimit = Number.parseInt(opts.limit ?? '', 10);
    const pageSize = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 20)
      : 20;
    const query = opts.q?.trim();
    if (query && query.length > 100) {
      throw new BadRequestException('搜索关键词最多 100 字');
    }

    let cursorId: bigint | undefined;
    if (cursor) {
      try {
        cursorId = BigInt(cursor);
        if (cursorId <= 0n) throw new Error('invalid cursor');
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
      },
    });

    const hasMore = posts.length > pageSize;
    const items = posts.slice(0, pageSize);

    return {
      items: items.map((p) => {
        const imageUrls = this.extractImageUrls(p.contentMd);
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
          contentExcerpt: (p.contentMd ?? '').slice(0, 200),
          imageUrls,
          thumbnailUrl: imageUrls[0],
          hasImages: imageUrls.length > 0,
          upvotes: p.upvotes,
          downvotes: p.downvotes,
          score: p.score,
          commentCount: p.commentCount,
          isLocked: p.isLocked,
          isPinned: p.isPinned,
          createdAt: p.createdAt.toISOString(),
        };
      }),
      nextCursor: hasMore ? String(items[items.length - 1].id) : undefined,
    };
  }

  async getPost(id: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: BigInt(id), status: 'published' },
      include: {
        board: true,
        author: { select: { id: true, username: true, avatarUrl: true } },
      },
    });
    if (!post) {
      throw new NotFoundException('帖子不存在');
    }

    const imageUrls = this.extractImageUrls(post.contentMd);

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
      contentMd: post.contentMd,
      contentHtml: post.contentHtml,
      imageUrls,
      thumbnailUrl: imageUrls[0],
      hasImages: imageUrls.length > 0,
      upvotes: post.upvotes,
      downvotes: post.downvotes,
      score: post.score,
      commentCount: post.commentCount,
      isLocked: post.isLocked,
      isPinned: post.isPinned,
      createdAt: post.createdAt.toISOString(),
    };
  }

  async createPost(data: {
    title: string;
    contentMd: string;
    boardSlug: string;
    isAnonymous?: boolean;
    imageUrls?: string[];
    authorId: bigint;
  }) {
    await this.rateLimit.consume('create-post-user', String(data.authorId), 10, 10 * 60);
    const { boardSlug } = data;
    if (!boardSlug) {
      throw new BadRequestException('请选择板块');
    }
    const title = data.title.trim();
    const contentBody = data.contentMd.trim();
    if (!title) {
      throw new BadRequestException('标题不能为空');
    }
    if (title.length > 200) {
      throw new BadRequestException('标题最多 200 字');
    }
    if (!contentBody) {
      throw new BadRequestException('内容不能为空');
    }
    if (contentBody.length > 5000) {
      throw new BadRequestException('内容最多 5000 字');
    }
    if (this.containsMarkdownImage(contentBody)) {
      throw new BadRequestException('请使用图片上传功能添加图片');
    }
    const user = await this.prisma.user.findUnique({ where: { id: data.authorId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    if (user.status === 'banned') {
      throw new ForbiddenException('账号已被封禁，不能发帖');
    }
    if (user.status === 'suspended' && (!user.suspendedUntil || user.suspendedUntil > new Date())) {
      throw new ForbiddenException('账号正在禁言中，不能发帖');
    }

    const board = await this.prisma.board.findUnique({
      where: { slug: boardSlug },
    });
    if (!board || board.status !== 'active') {
      throw new BadRequestException('板块不存在');
    }

    // 检查匿名权限
    if (data.isAnonymous && !board.allowsAnonymous) {
      throw new BadRequestException('该板块不允许匿名发帖');
    }
    const isAnonymous = board.allowsAnonymous && data.isAnonymous !== false;

    const safeImageUrls = await this.validatePostImageUrls(data.imageUrls, data.authorId);
    const moderatedTitle = await this.moderation.moderateOrThrow(title);
    const moderatedBody = await this.moderation.moderateOrThrow(contentBody);
    const contentMd = this.appendImageMarkdown(moderatedBody.content, safeImageUrls);
    const contentHtml = this.renderMd(contentMd);
    const status: ContentStatus =
      moderatedTitle.status === 'pending_review' || moderatedBody.status === 'pending_review'
        ? 'pending_review'
        : 'published';

    const createdAt = new Date();
    const post = await this.prisma.$transaction(async (tx) => {
      const created = await tx.post.create({
        data: {
          boardId: board.id,
          authorId: data.authorId,
          title: moderatedTitle.content,
          contentMd,
          contentHtml,
          isAnonymous,
          status,
          upvotes: 1,
          score: 1,
          hotScore: this.hotScoreFor(1, createdAt),
          createdAt,
        },
        include: {
          board: true,
          author: { select: { id: true, username: true, avatarUrl: true } },
        },
      });
      await tx.vote.create({
        data: {
          userId: data.authorId,
          targetType: 'post',
          targetId: created.id,
          value: 1,
        },
      });
      return created;
    });

    const imageUrls = this.extractImageUrls(post.contentMd);

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
            pseudonym: this.pseudonymFor(post.id, post.author.id, true),
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
      contentExcerpt: contentBody.slice(0, 200),
      contentMd: post.contentMd,
      contentHtml: post.contentHtml,
      imageUrls,
      thumbnailUrl: imageUrls[0],
      hasImages: imageUrls.length > 0,
      upvotes: post.upvotes,
      downvotes: post.downvotes,
      score: post.score,
      commentCount: 0,
      isLocked: false,
      isPinned: false,
      createdAt: post.createdAt.toISOString(),
    };
  }

  async createComment(data: {
    postId: string;
    contentMd: string;
    parentId?: string;
    isAnonymous: boolean;
    authorId: bigint;
  }): Promise<CommentItem> {
    await this.rateLimit.consume('create-comment-user', String(data.authorId), 30, 60);
    const author = await this.getActiveAuthor(data.authorId);
    const post = await this.prisma.post.findFirst({
      where: { id: this.parseId(data.postId), status: 'published' },
      include: { board: { select: { allowsAnonymous: true } } },
    });
    if (!post) {
      throw new NotFoundException('帖子不存在');
    }
    if (post.isLocked) {
      throw new ForbiddenException('帖子已锁定，不能评论');
    }

    const parent = data.parentId
      ? await this.prisma.comment.findFirst({
          where: { id: this.parseId(data.parentId), postId: post.id, status: 'published' },
        })
      : null;
    if (data.parentId && !parent) {
      throw new NotFoundException('父评论不存在');
    }

    const contentBody = data.contentMd.trim();
    if (!contentBody) {
      throw new BadRequestException('评论内容不能为空');
    }
    if (contentBody.length > 2000) {
      throw new BadRequestException('评论内容最多 2000 字');
    }
    if (this.containsMarkdownImage(contentBody)) {
      throw new BadRequestException('评论不支持外部图片');
    }
    const moderated = await this.moderation.moderateOrThrow(contentBody);
    const isAnonymous = post.board.allowsAnonymous && data.isAnonymous;

    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          postId: post.id,
          parentId: parent?.id,
          depth: parent ? Math.min(parent.depth + 1, 3) : 0,
          authorId: author.id,
          contentMd: moderated.content,
          contentHtml: this.renderMd(moderated.content),
          isAnonymous,
          status: moderated.status,
        },
        include: {
          author: { select: { id: true, username: true, avatarUrl: true } },
        },
      });
      await tx.post.update({
        where: { id: post.id },
        data: { commentCount: { increment: 1 } },
      });
      const recipientId = parent?.authorId ?? post.authorId;
      if (moderated.status === 'published' && recipientId !== author.id) {
        await tx.notification.create({
          data: {
            recipientId,
            type: parent ? 'reply_comment' : 'reply_post',
            actorId: author.id,
            actorAnonymous: isAnonymous,
            postId: post.id,
            commentId: created.id,
            payload: {
              title: parent ? '你的评论收到了新回复' : '你的帖子收到了新评论',
              body: moderated.content.slice(0, 120),
              linkUrl: `/p/${post.id}#comment-${created.id}`,
            },
          },
        });
      }
      return created;
    });

    return this.toCommentItem(comment);
  }

  async listComments(postId: string, opts?: { cursor?: string }) {
    const parsedPostId = this.parseId(postId);
    const post = await this.prisma.post.findFirst({
      where: { id: parsedPostId, status: 'published' },
    });
    if (!post) {
      throw new NotFoundException('帖子不存在');
    }

    const pageSize = 20;
    const cursorId = opts?.cursor ? this.parseId(opts.cursor) : undefined;

    // Fetch root comments with pagination
    const rootComments = await this.prisma.comment.findMany({
      where: {
        postId: parsedPostId,
        status: 'published',
        parentId: null,
      },
      cursor: cursorId ? { id: cursorId } : undefined,
      skip: cursorId ? 1 : 0,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: pageSize + 1,
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
      },
    });

    const hasMore = rootComments.length > pageSize;
    const rootItems = rootComments.slice(0, pageSize);
    const rootIds = rootItems.map((c) => c.id);

    // 深度上限为 3，逐层取回可避免只显示第一层回复，也不会扫描整帖评论。
    const firstLevel = rootIds.length
      ? await this.prisma.comment.findMany({
          where: { postId: parsedPostId, status: 'published', parentId: { in: rootIds } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: { author: { select: { id: true, username: true, avatarUrl: true } } },
        })
      : [];
    const firstLevelIds = firstLevel.map((comment) => comment.id);
    const secondLevel = firstLevelIds.length
      ? await this.prisma.comment.findMany({
          where: { postId: parsedPostId, status: 'published', parentId: { in: firstLevelIds } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: { author: { select: { id: true, username: true, avatarUrl: true } } },
        })
      : [];
    const secondLevelIds = secondLevel.map((comment) => comment.id);
    const thirdLevel = secondLevelIds.length
      ? await this.prisma.comment.findMany({
          where: { postId: parsedPostId, status: 'published', parentId: { in: secondLevelIds } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: { author: { select: { id: true, username: true, avatarUrl: true } } },
        })
      : [];
    const replies = [...firstLevel, ...secondLevel, ...thirdLevel];

    // Build tree structure
    const map = new Map<string, CommentItem>();
    const roots: CommentItem[] = [];

    // Add root comments to map
    for (const c of rootItems) {
      const item = this.toCommentItem(c);
      map.set(item.id, item);
      roots.push(item);
    }

    // Add replies to their parents
    for (const c of replies) {
      const item = this.toCommentItem(c);
      map.set(item.id, item);
      if (c.parentId) {
        const parent = map.get(String(c.parentId));
        if (parent) {
          parent.replies = parent.replies ?? [];
          parent.replies.push(item);
        }
      }
    }

    return {
      items: roots,
      nextCursor: hasMore ? String(rootItems[rootItems.length - 1].id) : undefined,
    };
  }

  async vote(targetType: 'post' | 'comment', targetId: string, value: 1 | -1 | 0, userId: bigint) {
    await this.rateLimit.consume('vote-user', String(userId), 120, 60);
    if (value !== -1 && value !== 0 && value !== 1) {
      throw new BadRequestException('无效投票值');
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

      // 从投票事实表重新汇总，重复/并发请求也不会把计数累加两次。
      const grouped = await tx.vote.groupBy({
        by: ['value'],
        where: { targetType, targetId: id },
        _count: { _all: true },
      });
      const upvotes = grouped.find((group) => group.value === 1)?._count._all ?? 0;
      const downvotes = grouped.find((group) => group.value === -1)?._count._all ?? 0;
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
            hotScore: this.hotScoreFor(score, post.createdAt),
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

  async reportTarget(data: {
    reporterId: bigint;
    targetType: 'post' | 'comment' | 'user';
    targetId: string;
    category: 'illegal' | 'porn' | 'ad' | 'harassment' | 'other';
    reason?: string;
  }) {
    await this.rateLimit.consume('report-user', String(data.reporterId), 10, 3600);
    if (!['post', 'comment', 'user'].includes(data.targetType)) {
      throw new BadRequestException('无效的举报目标');
    }
    if (!['illegal', 'porn', 'ad', 'harassment', 'other'].includes(data.category)) {
      throw new BadRequestException('无效的举报类别');
    }
    if (data.reason && data.reason.trim().length > 1000) {
      throw new BadRequestException('举报理由最多 1000 字');
    }
    const reporter = await this.getActiveAuthor(data.reporterId);
    const targetId = this.parseId(data.targetId);
    await this.ensureReportTargetExists(data.targetType, targetId);

    const existing = await this.prisma.report.findFirst({
      where: {
        reporterId: reporter.id,
        targetType: data.targetType,
        targetId,
        status: 'open',
      },
    });
    if (existing) {
      throw new BadRequestException('你已经举报过该内容，请等待处理');
    }

    await this.prisma.report.create({
      data: {
        reporterId: reporter.id,
        targetType: data.targetType,
        targetId,
        category: data.category,
        reason: data.reason?.trim() || null,
        status: 'open',
      },
    });

    return { ok: true };
  }

  private renderMd(md: string): string {
    return this.markdown.render(md);
  }

  private hotScoreFor(score: number, createdAt: Date): number {
    const order = Math.log(Math.max(Math.abs(score), 1));
    return Math.sign(score) * order + createdAt.getTime() / 1000 / 45_000;
  }

  private appendImageMarkdown(contentMd: string, imageUrls?: string[]): string {
    const urls = (imageUrls ?? [])
      .map((url) => url.trim())
      .filter(Boolean)
      .slice(0, 4);
    if (urls.length === 0) {
      return contentMd;
    }
    const images = urls.map((url, index) => `![帖子图片 ${index + 1}](${url})`).join('\n\n');
    return `${contentMd}\n\n${images}`;
  }

  private extractImageUrls(contentMd: string): string[] {
    return [...contentMd.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)].map((match) => match[1]);
  }

  private containsMarkdownImage(content: string): boolean {
    return /!\[[^\]]*\]\s*\(/.test(content);
  }

  private async validatePostImageUrls(
    imageUrls: string[] | undefined,
    userId: bigint,
  ): Promise<string[]> {
    if (imageUrls === undefined) {
      return [];
    }
    if (!Array.isArray(imageUrls) || imageUrls.length > 4) {
      throw new BadRequestException('每个帖子最多上传 4 张图片');
    }

    const keys = imageUrls.map((url) => this.cdnUploadKey(url, 'posts'));
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('图片不能重复');
    }
    const owned = await this.prisma.upload.count({
      where: {
        userId,
        s3Key: { in: keys },
        moderationStatus: 'passed',
      },
    });
    if (owned !== keys.length) {
      throw new BadRequestException('图片不存在或不属于当前用户');
    }

    const base = this.config.get('CDN_BASE_URL').replace(/\/+$/, '');
    return keys.map((key) => `${base}/${key}`);
  }

  private cdnUploadKey(value: unknown, folder: 'posts'): string {
    if (typeof value !== 'string' || value.length > 2048) {
      throw new BadRequestException('无效的图片地址');
    }
    try {
      const base = new URL(`${this.config.get('CDN_BASE_URL').replace(/\/+$/, '')}/`);
      const url = new URL(value);
      if (
        url.origin !== base.origin ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !url.pathname.startsWith(base.pathname)
      ) {
        throw new Error('untrusted URL');
      }
      const key = url.pathname.slice(base.pathname.length);
      if (!key.startsWith(`${folder}/`) || !/^[A-Za-z0-9/_-]+\.(?:jpg|png)$/.test(key)) {
        throw new Error('untrusted key');
      }
      return key;
    } catch {
      throw new BadRequestException('无效的图片地址');
    }
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

  private async ensureReportTargetExists(targetType: 'post' | 'comment' | 'user', id: bigint) {
    if (targetType === 'post') {
      const post = await this.prisma.post.findFirst({ where: { id, status: { not: 'deleted' } } });
      if (!post) {
        throw new NotFoundException('举报目标不存在');
      }
      return;
    }
    if (targetType === 'comment') {
      const comment = await this.prisma.comment.findFirst({
        where: { id, status: { not: 'deleted' } },
      });
      if (!comment) {
        throw new NotFoundException('举报目标不存在');
      }
      return;
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('举报目标不存在');
    }
  }

  private toCommentItem(comment: {
    id: bigint;
    postId: bigint;
    parentId: bigint | null;
    author: { id: bigint; username: string; avatarUrl: string | null };
    contentMd: string;
    contentHtml: string;
    isAnonymous: boolean;
    status: ContentStatus;
    upvotes: number;
    downvotes: number;
    score: number;
    depth: number;
    createdAt: Date;
  }): CommentItem {
    return {
      id: String(comment.id),
      postId: String(comment.postId),
      parentId: comment.parentId ? String(comment.parentId) : undefined,
      author: comment.isAnonymous
        ? {
            type: 'anonymous',
            pseudonym: this.pseudonymFor(comment.postId, comment.author.id, false),
          }
        : {
            type: 'user',
            user: {
              id: String(comment.author.id),
              username: comment.author.username,
              avatarUrl: comment.author.avatarUrl,
            },
          },
      contentMd: comment.contentMd,
      contentHtml: comment.contentHtml,
      upvotes: comment.upvotes,
      downvotes: comment.downvotes,
      score: comment.score,
      isDeleted: comment.status === 'deleted',
      depth: comment.depth,
      createdAt: comment.createdAt.toISOString(),
    };
  }

  private parseId(id: string): bigint {
    try {
      return BigInt(id);
    } catch {
      throw new BadRequestException('无效 ID');
    }
  }

  private pseudonymFor(postId: bigint, userId: bigint, isOp: boolean) {
    const words = [
      '晨曦',
      '松风',
      '海盐',
      '星河',
      '青柚',
      '云朵',
      '山茶',
      '微光',
      '竹影',
      '月白',
      '橙子',
      '南风',
    ];
    const digest = createHmac('sha256', this.config.get('ANON_SECRET'))
      .update(`${postId}:${userId}`)
      .digest();
    const name = words[digest[0] % words.length];
    const hue = digest[1] % 360;
    return {
      displayName: isOp ? `楼主 · ${name}` : `匿名 · ${name}`,
      color: `hsl(${hue} 65% 52%)`,
      isOp,
    };
  }
}

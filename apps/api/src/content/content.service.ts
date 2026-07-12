import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type ContentStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.module';
import { AppConfig } from '../config/app.config';
import { ModerationService } from '../common/moderation.service';
import { RateLimitService } from '../common/security/rate-limit.service';
import { COMMUNITY_RULES_VERSION } from '../common/community-safety.constants';
import { createSafeMarkdownRenderer } from '../common/safe-markdown';

type ApiAuthor =
  | { type: 'anonymous'; pseudonym: { displayName: string; color: string; isOp: boolean } }
  | { type: 'user'; user: { id: string; username: string; avatarUrl: string | null } };

type QuotedPostPreview = {
  id: string;
  title: string;
  contentExcerpt: string;
  board: { slug: string; name: string };
};

type ReportTargetInput =
  | 'post'
  | 'comment'
  | 'user'
  | 'conversation'
  | 'direct_message'
  | 'chatroom_message';

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
  status: ContentStatus;
  depth: number;
  createdAt: string;
  replies?: CommentItem[];
}

@Injectable()
export class ContentService {
  private readonly markdown = createSafeMarkdownRenderer();

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
    userId?: bigint;
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
    const post = await this.prisma.post.findFirst({
      where: { id: BigInt(id), status: 'published' },
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

    const imageUrls = this.extractImageUrls(post.contentMd);
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
      contentMd: this.normalizeImageUrls(post.contentMd),
      contentHtml: this.normalizeImageUrls(post.contentHtml),
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

  async createPost(data: {
    title: string;
    contentMd: string;
    boardSlug: string;
    isAnonymous?: boolean;
    imageUrls?: string[];
    quotedPostId?: string;
    authorId: bigint;
    rulesAcknowledged?: boolean;
    authorIp?: string;
    authorUserAgent?: string;
  }) {
    await this.rateLimit.consume('create-post-user', String(data.authorId), 10, 10 * 60);
    const { boardSlug } = data;
    if (data.rulesAcknowledged !== true) {
      throw new BadRequestException({
        code: 'RULES_ACKNOWLEDGEMENT_REQUIRED',
        message: '请先确认已阅读并遵守社区规则',
      });
    }
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
    if (Date.now() - user.createdAt.getTime() < 7 * 24 * 60 * 60 * 1000) {
      await this.rateLimit.consume(
        'create-post-new-user',
        String(data.authorId),
        3,
        3600,
        '新用户保护期内每小时最多发布 3 个帖子',
      );
    }

    const board = await this.prisma.board.findUnique({
      where: { slug: boardSlug },
    });
    if (!board || board.status !== 'active') {
      throw new BadRequestException('板块不存在');
    }

    const isAnonymous = true;
    const quotedPostId = data.quotedPostId ? this.parseId(data.quotedPostId) : undefined;
    if (quotedPostId) {
      const quotedPost = await this.prisma.post.findFirst({
        where: { id: quotedPostId, status: 'published' },
        select: { id: true },
      });
      if (!quotedPost) {
        throw new BadRequestException('引用的帖子不存在或已不可见');
      }
    }

    const imageValidation = await this.validatePostImageUrls(data.imageUrls, data.authorId);
    const safeImageUrls = imageValidation.urls;
    const moderationContext = {
      surface: 'post' as const,
      authorId: data.authorId,
      ip: data.authorIp,
      userAgent: data.authorUserAgent,
    };
    const moderatedTitle = await this.moderation.moderateOrThrow(title, moderationContext);
    const moderatedBody = await this.moderation.moderateOrThrow(contentBody, moderationContext);
    const contentMd = this.appendImageMarkdown(moderatedBody.content, safeImageUrls);
    const contentHtml = this.renderMd(contentMd);
    const status: ContentStatus = 'published';
    const combinedContent = `${title}\n${contentBody}`;
    const combinedHash = createHash('sha256').update(combinedContent).digest('hex');
    const moderationLabels = {
      title: this.moderation.moderationLabels(moderatedTitle),
      body: this.moderation.moderationLabels(moderatedBody),
      imagePending: imageValidation.hasPending,
    } as unknown as Prisma.InputJsonValue;

    const createdAt = new Date();
    const post = await this.prisma.$transaction(async (tx) => {
      const created = await tx.post.create({
        data: {
          boardId: board.id,
          authorId: data.authorId,
          quotedPostId,
          title: moderatedTitle.content,
          contentMd,
          contentHtml,
          isAnonymous,
          status,
          moderationLabels,
          contentHash: combinedHash,
          legalHold: false,
          authorIp: data.authorIp && data.authorIp !== 'unknown' ? data.authorIp : null,
          authorUserAgent: data.authorUserAgent?.slice(0, 512),
          upvotes: 0,
          score: 0,
          hotScore: this.hotScoreFor(0, createdAt),
          createdAt,
        },
        include: {
          board: true,
          author: { select: { id: true, username: true, avatarUrl: true } },
        },
      });
      await tx.policyAcceptance.create({
        data: {
          userId: data.authorId,
          policyVersion: COMMUNITY_RULES_VERSION,
          source: 'publish',
          ip: data.authorIp && data.authorIp !== 'unknown' ? data.authorIp : null,
          userAgent: data.authorUserAgent?.slice(0, 512),
        },
      });
      return created;
    });

    if (safeImageUrls.length > 0) {
      await this.prisma.upload.updateMany({
        where: {
          userId: data.authorId,
          s3Key: { in: safeImageUrls.map((url) => this.cdnUploadKey(url, 'posts')) },
        },
        data: { attachedToType: 'post', attachedToId: post.id },
      });
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
      contentMd: this.normalizeImageUrls(post.contentMd),
      contentHtml: this.normalizeImageUrls(post.contentHtml),
      imageUrls,
      thumbnailUrl: imageUrls[0],
      hasImages: imageUrls.length > 0,
      upvotes: post.upvotes,
      downvotes: post.downvotes,
      score: post.score,
      commentCount: 0,
      isLocked: false,
      isPinned: false,
      status,
      createdAt: post.createdAt.toISOString(),
    };
  }

  async createComment(data: {
    postId: string;
    contentMd: string;
    parentId?: string;
    isAnonymous: boolean;
    authorId: bigint;
    rulesAcknowledged?: boolean;
    authorIp?: string;
    authorUserAgent?: string;
  }): Promise<CommentItem> {
    await this.rateLimit.consume('create-comment-user', String(data.authorId), 30, 60);
    const author = await this.getActiveAuthor(data.authorId);
    if (data.rulesAcknowledged !== true) {
      throw new BadRequestException({
        code: 'RULES_ACKNOWLEDGEMENT_REQUIRED',
        message: '请先确认已阅读并遵守社区规则',
      });
    }
    if (Date.now() - author.createdAt.getTime() < 7 * 24 * 60 * 60 * 1000) {
      await this.rateLimit.consume(
        'create-comment-new-user',
        String(data.authorId),
        10,
        10 * 60,
        '新用户保护期内评论过于频繁，请稍后再试',
      );
    }
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
    const moderationContext = {
      surface: 'comment' as const,
      authorId: data.authorId,
      ip: data.authorIp,
      userAgent: data.authorUserAgent,
    };
    const moderated = await this.moderation.moderateOrThrow(contentBody, moderationContext);
    const isAnonymous = true;

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
          status: 'published',
          moderationLabels: this.moderation.moderationLabels(
            moderated,
          ) as unknown as Prisma.InputJsonValue,
          contentHash: moderated.contentHash,
          legalHold: false,
          authorIp: data.authorIp && data.authorIp !== 'unknown' ? data.authorIp : null,
          authorUserAgent: data.authorUserAgent?.slice(0, 512),
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
      if (recipientId !== author.id) {
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
      await tx.policyAcceptance.create({
        data: {
          userId: data.authorId,
          policyVersion: COMMUNITY_RULES_VERSION,
          source: 'publish',
          ip: data.authorIp && data.authorIp !== 'unknown' ? data.authorIp : null,
          userAgent: data.authorUserAgent?.slice(0, 512),
        },
      });
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

      // 从投票事实表重新汇总，重复/并发请求也不会把计数累加两次。
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
    targetType: ReportTargetInput;
    targetId: string;
    category: 'illegal' | 'porn' | 'ad' | 'harassment' | 'other';
    reason?: string;
    evidenceMessageIds?: string[];
  }) {
    await this.rateLimit.consume('report-user', String(data.reporterId), 10, 3600);
    if (
      !['post', 'comment', 'user', 'conversation', 'direct_message', 'chatroom_message'].includes(
        data.targetType,
      )
    ) {
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
    if (data.evidenceMessageIds && data.evidenceMessageIds.length > 20) {
      throw new BadRequestException('一次最多选择 20 条证据消息');
    }
    const evidence = await this.buildReportEvidence(
      data.targetType,
      targetId,
      reporter.id,
      data.evidenceMessageIds,
    );
    const priority = { illegal: 100, porn: 90, harassment: 60, ad: 40, other: 20 }[data.category];

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.report.create({
          data: {
            reporterId: reporter.id,
            targetType: data.targetType,
            targetId,
            category: data.category,
            reason: data.reason?.trim() || null,
            status: 'open',
            priority,
            evidenceSnapshot: evidence.snapshot,
            contentHash: evidence.contentHash,
            legalHold: data.category === 'illegal' || data.category === 'porn',
          },
        });
        if (data.category === 'illegal' || data.category === 'porn') {
          await this.applyEvidenceHold(tx, data.targetType, targetId, evidence.messageIds);
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('你已经举报过该内容，请等待处理');
      }
      throw error;
    }

    if (data.category === 'illegal' || data.category === 'porn') {
      const highSeverityReports = await this.prisma.report.count({
        where: {
          targetType: data.targetType,
          targetId,
          status: 'open',
          category: { in: ['illegal', 'porn'] },
        },
      });
      if (highSeverityReports >= 3) {
        await this.quarantineReportedTarget(data.targetType, targetId);
      }
    }

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
    return [...contentMd.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)].map((match) =>
      this.publicImageUrl(match[1]),
    );
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

  private normalizeImageUrls(content: string): string {
    return content.replace(
      /https?:\/\/[^\s"')]+\/(posts|registrations|chatrooms)\/([A-Za-z0-9_-]+\.(?:jpg|png))/g,
      (_match, folder: string, filename: string) => `/api/v1/uploads/public/${folder}/${filename}`,
    );
  }

  private publicImageUrl(value: string): string {
    const match = value.match(
      /\/(posts|registrations|chatrooms)\/([A-Za-z0-9_-]+\.(?:jpg|png))(?:[?#].*)?$/,
    );
    return match ? `/api/v1/uploads/public/${match[1]}/${match[2]}` : value;
  }

  private containsMarkdownImage(content: string): boolean {
    return /!\[[^\]]*\]\s*\(/.test(content);
  }

  private async validatePostImageUrls(
    imageUrls: string[] | undefined,
    userId: bigint,
  ): Promise<{ urls: string[]; hasPending: boolean }> {
    if (imageUrls === undefined) {
      return { urls: [], hasPending: false };
    }
    if (!Array.isArray(imageUrls) || imageUrls.length > 4) {
      throw new BadRequestException('每个帖子最多上传 4 张图片');
    }

    const keys = imageUrls.map((url) => this.cdnUploadKey(url, 'posts'));
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('图片不能重复');
    }
    const owned = await this.prisma.upload.findMany({
      where: {
        userId,
        s3Key: { in: keys },
        moderationStatus: { in: ['passed', 'pending'] },
      },
      select: { s3Key: true, moderationStatus: true },
    });
    if (owned.length !== keys.length) {
      throw new BadRequestException('图片不存在、不属于当前用户或已被驳回');
    }

    const base = this.config.get('CDN_BASE_URL').replace(/\/+$/, '');
    return {
      urls: keys.map((key) => `${base}/${key}`),
      hasPending: owned.some((upload) => upload.moderationStatus === 'pending'),
    };
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

  private async buildReportEvidence(
    targetType: ReportTargetInput,
    id: bigint,
    reporterId: bigint,
    evidenceMessageIds?: string[],
  ): Promise<{ snapshot: Prisma.InputJsonValue; contentHash: string; messageIds: bigint[] }> {
    let snapshot: Record<string, unknown>;
    let rawContent = '';
    let messageIds: bigint[] = [];

    if (targetType === 'post') {
      const post = await this.prisma.post.findFirst({
        where: { id, status: { not: 'deleted' } },
        select: { id: true, title: true, contentMd: true, createdAt: true, boardId: true },
      });
      if (!post) {
        throw new NotFoundException('举报目标不存在');
      }
      rawContent = `${post.title}\n${post.contentMd}`;
      snapshot = {
        type: 'post',
        id: String(post.id),
        title: post.title,
        content: post.contentMd.slice(0, 5000),
        boardId: String(post.boardId),
        createdAt: post.createdAt.toISOString(),
      };
    } else if (targetType === 'comment') {
      const comment = await this.prisma.comment.findFirst({
        where: { id, status: { not: 'deleted' } },
        select: { id: true, postId: true, contentMd: true, createdAt: true },
      });
      if (!comment) {
        throw new NotFoundException('举报目标不存在');
      }
      rawContent = comment.contentMd;
      snapshot = {
        type: 'comment',
        id: String(comment.id),
        postId: String(comment.postId),
        content: comment.contentMd.slice(0, 5000),
        createdAt: comment.createdAt.toISOString(),
      };
    } else if (targetType === 'user') {
      if (id === reporterId) {
        throw new BadRequestException('不能举报自己');
      }
      const user = await this.prisma.user.findUnique({
        where: { id },
        select: { id: true, username: true, createdAt: true },
      });
      if (!user) {
        throw new NotFoundException('举报目标不存在');
      }
      rawContent = user.username;
      snapshot = {
        type: 'user',
        id: String(user.id),
        username: user.username,
        createdAt: user.createdAt.toISOString(),
      };
    } else if (targetType === 'conversation') {
      const conversation = await this.prisma.conversation.findFirst({
        where: {
          id,
          OR: [{ initiatorId: reporterId }, { recipientId: reporterId }],
        },
        select: {
          id: true,
          initiatorId: true,
          recipientId: true,
          status: true,
          createdAt: true,
        },
      });
      if (!conversation) {
        throw new NotFoundException('举报目标不存在');
      }
      const selectedIds = (evidenceMessageIds ?? []).map((value) => this.parseId(value));
      const messages = await this.prisma.directMessage.findMany({
        where: {
          conversationId: conversation.id,
          senderId: { not: reporterId },
          // Only messages that were actually delivered to the reporter may be
          // used as evidence. Pending messages are intentionally sender-only.
          status: 'published',
          ...(selectedIds.length ? { id: { in: selectedIds } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, senderId: true, contentMd: true, createdAt: true },
      });
      if (messages.length === 0) {
        throw new BadRequestException('没有可举报的对方消息');
      }
      messageIds = messages.map((message) => message.id);
      rawContent = messages.map((message) => message.contentMd).join('\n');
      snapshot = {
        type: 'conversation',
        id: String(conversation.id),
        accusedUserId: String(
          conversation.initiatorId === reporterId
            ? conversation.recipientId
            : conversation.initiatorId,
        ),
        status: conversation.status,
        messages: messages.reverse().map((message) => ({
          id: String(message.id),
          content: message.contentMd.slice(0, 2000),
          createdAt: message.createdAt.toISOString(),
        })),
        createdAt: conversation.createdAt.toISOString(),
      };
    } else if (targetType === 'direct_message') {
      const message = await this.prisma.directMessage.findFirst({
        where: {
          id,
          senderId: { not: reporterId },
          status: 'published',
          conversation: { OR: [{ initiatorId: reporterId }, { recipientId: reporterId }] },
        },
        select: {
          id: true,
          conversationId: true,
          senderId: true,
          contentMd: true,
          createdAt: true,
        },
      });
      if (!message) {
        throw new NotFoundException('举报目标不存在');
      }
      messageIds = [message.id];
      rawContent = message.contentMd;
      snapshot = {
        type: 'direct_message',
        id: String(message.id),
        conversationId: String(message.conversationId),
        accusedUserId: String(message.senderId),
        content: message.contentMd.slice(0, 2000),
        createdAt: message.createdAt.toISOString(),
      };
    } else {
      const message = await this.prisma.chatroomMessage.findFirst({
        where: { id, status: 'published' },
        select: { id: true, chatroomId: true, senderId: true, content: true, createdAt: true },
      });
      if (!message) {
        throw new NotFoundException('举报目标不存在');
      }
      if (message.senderId === reporterId) {
        throw new BadRequestException('不能举报自己的消息');
      }
      messageIds = [message.id];
      rawContent = message.content;
      snapshot = {
        type: 'chatroom_message',
        id: String(message.id),
        chatroomId: String(message.chatroomId),
        accusedUserId: String(message.senderId),
        content: message.content.slice(0, 2000),
        createdAt: message.createdAt.toISOString(),
      };
    }

    return {
      snapshot: snapshot as Prisma.InputJsonValue,
      contentHash: createHash('sha256').update(rawContent).digest('hex'),
      messageIds,
    };
  }

  private async applyEvidenceHold(
    tx: Prisma.TransactionClient,
    targetType: ReportTargetInput,
    targetId: bigint,
    messageIds: bigint[],
  ) {
    if (targetType === 'post') {
      await tx.post.update({ where: { id: targetId }, data: { legalHold: true } });
    } else if (targetType === 'comment') {
      await tx.comment.update({ where: { id: targetId }, data: { legalHold: true } });
    } else if (targetType === 'direct_message' || targetType === 'conversation') {
      await tx.directMessage.updateMany({
        where: { id: { in: messageIds } },
        data: { legalHold: true },
      });
    } else if (targetType === 'chatroom_message') {
      const message = await tx.chatroomMessage.update({
        where: { id: targetId },
        data: { legalHold: true },
        select: { chatroomId: true },
      });
      await tx.chatroom.update({ where: { id: message.chatroomId }, data: { legalHold: true } });
    }
  }

  private async quarantineReportedTarget(targetType: ReportTargetInput, targetId: bigint) {
    if (targetType === 'post') {
      await this.prisma.post.updateMany({
        where: { id: targetId, status: 'published' },
        data: { status: 'pending_review', legalHold: true },
      });
    } else if (targetType === 'comment') {
      await this.prisma.$transaction(async (tx) => {
        const comment = await tx.comment.findUnique({
          where: { id: targetId },
          select: { postId: true },
        });
        if (!comment) {
          return;
        }
        const quarantined = await tx.comment.updateMany({
          where: { id: targetId, status: 'published' },
          data: { status: 'pending_review', legalHold: true },
        });
        if (quarantined.count === 1) {
          await tx.post.updateMany({
            where: { id: comment.postId, commentCount: { gt: 0 } },
            data: { commentCount: { decrement: 1 } },
          });
        }
      });
    } else if (targetType === 'direct_message') {
      await this.prisma.directMessage.updateMany({
        where: { id: targetId, status: 'published' },
        data: { status: 'pending_review', legalHold: true },
      });
    } else if (targetType === 'conversation') {
      await this.prisma.conversation.update({
        where: { id: targetId },
        data: { status: 'blocked' },
      });
    } else if (targetType === 'chatroom_message') {
      await this.prisma.chatroomMessage.updateMany({
        where: { id: targetId, status: 'published' },
        data: { status: 'pending_review', isFlagged: true, legalHold: true },
      });
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
      status: comment.status,
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

  private pseudonymFor(_postId: bigint, _userId: bigint, isOp: boolean) {
    return {
      displayName: '浙小商',
      color: 'hsl(24 90% 52%)',
      isOp,
    };
  }
}

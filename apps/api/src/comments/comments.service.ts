import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type ContentStatus } from '@prisma/client';
import { COMMUNITY_RULES_VERSION } from '../common/community-safety.constants';
import { ModerationService } from '../common/moderation.service';
import { RateLimitService } from '../common/security/rate-limit.service';
import { createSafeMarkdownRenderer } from '../common/safe-markdown';
import { PrismaService } from '../prisma/prisma.module';

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
  status: ContentStatus;
  depth: number;
  createdAt: string;
  replies?: CommentItem[];
}

export type CreateCommentInput = {
  postId: string;
  contentMd: string;
  parentId?: string;
  isAnonymous: boolean;
  authorId: bigint;
  rulesAcknowledged?: boolean;
  authorIp?: string;
  authorUserAgent?: string;
};

export type ListCommentsOptions = {
  cursor?: string;
};

@Injectable()
export class CommentsService {
  private readonly markdown = createSafeMarkdownRenderer();

  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async createComment(data: CreateCommentInput): Promise<CommentItem> {
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
    if (parent && parent.depth >= 3) {
      throw new BadRequestException('评论回复层级最多 3 层');
    }

    if (typeof data.contentMd !== 'string') {
      throw new BadRequestException('评论内容格式无效');
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
          status: moderated.status,
          moderationLabels: this.moderation.moderationLabels(
            moderated,
          ) as unknown as Prisma.InputJsonValue,
          contentHash: moderated.contentHash,
          legalHold: moderated.status === 'pending_review' && moderated.riskLevel >= 4,
          authorIp: data.authorIp && data.authorIp !== 'unknown' ? data.authorIp : null,
          authorUserAgent: data.authorUserAgent?.slice(0, 512),
        },
        include: {
          author: { select: { id: true, username: true, avatarUrl: true } },
        },
      });
      if (moderated.status === 'published') {
        await tx.post.update({
          where: { id: post.id },
          data: { commentCount: { increment: 1 } },
        });
      }
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
              linkUrl: '/p/' + post.id + '#comment-' + created.id,
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

    if (moderated.status === 'pending_review') {
      await this.moderation.recordCase(moderated, moderationContext, comment.id, contentBody);
    }

    return this.toCommentItem(comment);
  }

  async listComments(postId: string, opts?: ListCommentsOptions) {
    const parsedPostId = this.parseId(postId);
    const post = await this.prisma.post.findFirst({
      where: { id: parsedPostId, status: 'published' },
    });
    if (!post) {
      throw new NotFoundException('帖子不存在');
    }

    const pageSize = 20;
    const cursorId = opts?.cursor ? this.parseId(opts.cursor) : undefined;
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
    const rootIds = rootItems.map((comment) => comment.id);

    // 深度上限为 3，逐层读取，避免扫描整帖评论。
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

    const map = new Map<string, CommentItem>();
    const roots: CommentItem[] = [];
    for (const comment of rootItems) {
      const item = this.toCommentItem(comment);
      map.set(item.id, item);
      roots.push(item);
    }
    for (const comment of replies) {
      const item = this.toCommentItem(comment);
      map.set(item.id, item);
      if (comment.parentId) {
        const parent = map.get(String(comment.parentId));
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

  private renderMd(md: string): string {
    return this.markdown.render(md);
  }

  private containsMarkdownImage(content: string): boolean {
    return /!\[[^\]]*\]\s*\(/.test(content);
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

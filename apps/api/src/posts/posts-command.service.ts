import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type ContentStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AppConfig } from '../config/app.config';
import { COMMUNITY_RULES_VERSION } from '../common/community-safety.constants';
import { ModerationService } from '../common/moderation.service';
import { RateLimitService } from '../common/security/rate-limit.service';
import { PrismaService } from '../prisma/prisma.module';
import { parsePublicMediaKey, publicMediaUrl } from '../upload/media-url';
import { imageUrlsForPostContent, normalizePostMedia } from './post-media';
import { hotScoreFor } from './post-scoring';
import { createSafeMarkdownRenderer } from '../common/safe-markdown';

export type CreatePostInput = {
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
};

@Injectable()
export class PostsCommandService {
  private readonly markdown = createSafeMarkdownRenderer();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly moderation: ModerationService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async createPost(data: CreatePostInput) {
    await this.rateLimit.consume('create-post-user', String(data.authorId), 10, 10 * 60);
    if (data.rulesAcknowledged !== true) {
      throw new BadRequestException({
        code: 'RULES_ACKNOWLEDGEMENT_REQUIRED',
        message: '请先确认已阅读并遵守社区规则',
      });
    }
    if (
      typeof data.title !== 'string' ||
      typeof data.contentMd !== 'string' ||
      typeof data.boardSlug !== 'string'
    ) {
      throw new BadRequestException('帖子内容格式无效');
    }
    const boardSlug = data.boardSlug.trim();
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
    const contentHtml = this.markdown.render(contentMd);
    const status: ContentStatus =
      moderatedTitle.status === 'pending_review' ||
      moderatedBody.status === 'pending_review' ||
      imageValidation.hasPending
        ? 'pending_review'
        : 'published';
    let moderationResult =
      moderatedTitle.riskLevel >= moderatedBody.riskLevel ? moderatedTitle : moderatedBody;
    if (imageValidation.hasPending && moderationResult.status !== 'pending_review') {
      moderationResult = {
        ...moderationResult,
        status: 'pending_review',
        riskLevel: Math.max(moderationResult.riskLevel, 2),
        reasonCodes: [...moderationResult.reasonCodes, 'image_pending_review'],
      };
    }
    const combinedHash = createHash('sha256')
      .update(title + '\n' + contentBody)
      .digest('hex');
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
          legalHold: status === 'pending_review' && moderationResult.riskLevel >= 4,
          authorIp: data.authorIp && data.authorIp !== 'unknown' ? data.authorIp : null,
          authorUserAgent: data.authorUserAgent?.slice(0, 512),
          upvotes: 0,
          score: 0,
          hotScore: hotScoreFor(0, createdAt),
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
      if (safeImageUrls.length > 0) {
        await tx.upload.updateMany({
          where: {
            userId: data.authorId,
            s3Key: { in: safeImageUrls.map((url) => this.cdnUploadKey(url, 'posts')) },
          },
          data: { attachedToType: 'post', attachedToId: created.id },
        });
      }
      return created;
    });

    if (status === 'pending_review') {
      await this.moderation.recordCase(
        { ...moderationResult, contentHash: combinedHash },
        moderationContext,
        post.id,
        `${title}\n${contentBody}`,
      );
    }

    const imageUrls = imageUrlsForPostContent(post.contentMd);
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
      contentMd: normalizePostMedia(post.contentMd),
      contentHtml: normalizePostMedia(post.contentHtml),
      imageUrls,
      thumbnailUrl: imageUrls[0],
      hasImages: imageUrls.length > 0,
      upvotes: post.upvotes,
      downvotes: post.downvotes,
      score: post.score,
      commentCount: 0,
      isLocked: false,
      isPinned: false,
      status: post.status,
      createdAt: post.createdAt.toISOString(),
    };
  }

  private appendImageMarkdown(contentMd: string, imageUrls?: string[]): string {
    const urls = (imageUrls ?? [])
      .map((url) => url.trim())
      .filter(Boolean)
      .slice(0, 4);
    if (urls.length === 0) {
      return contentMd;
    }
    const images = urls
      .map((url, index) => '![帖子图片 ' + (index + 1) + '](' + url + ')')
      .join('\n\n');
    return contentMd + '\n\n' + images;
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

    return {
      urls: keys.map(publicMediaUrl),
      hasPending: owned.some((upload) => upload.moderationStatus === 'pending'),
    };
  }

  private cdnUploadKey(value: unknown, folder: 'posts'): string {
    if (typeof value !== 'string' || value.length > 2048) {
      throw new BadRequestException('无效的图片地址');
    }
    return parsePublicMediaKey(value, folder, this.config.get('CDN_BASE_URL'));
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

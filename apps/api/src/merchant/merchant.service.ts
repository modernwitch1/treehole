import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ContentStatus, FoodProductStatus, FoodStaffRole, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { createSafeMarkdownRenderer } from '../common/safe-markdown';
import { ModerationService } from '../common/moderation.service';
import { PrismaService } from '../prisma/prisma.module';
import type { MerchantPrincipal } from '../merchant-auth/merchant-auth.guard';
import { FoodService } from '../food/food.service';
import type { CreateFoodPostDto } from '../food/food.dto';
import type {
  CreateMerchantProductDto,
  MerchantPostQueryDto,
  MerchantProductQueryDto,
  MerchantReplyDto,
  MerchantReviewQueryDto,
  UpdateMerchantProfileDto,
  UpdateMerchantProductDto,
  UpdateMerchantPostDto,
  UpdateMerchantWindowDto,
} from './merchant.dto';

const WINDOW_INCLUDE = {
  canteen: { select: { id: true, slug: true, name: true } },
  merchant: { select: { id: true, slug: true, name: true, logoUrl: true } },
} as const;

type MerchantWindowView = {
  id: bigint;
  floor: number;
  name: string;
  windowNumber: string | null;
  locationDescription: string | null;
  isActive: boolean;
  canteen: { id: bigint; slug: string; name: string };
  merchant?: { id: bigint; slug: string; name: string; logoUrl: string | null } | null;
};

type MerchantProductView = {
  id: bigint;
  merchantId: bigint;
  name: string;
  category: string | null;
  description: string | null;
  priceCents: number | null;
  imageUrl: string | null;
  status: FoodProductStatus;
  isAvailable: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  window: MerchantWindowView | null;
};

type MerchantPostView = {
  id: bigint;
  type: string;
  title: string;
  contentMd: string;
  contentHtml: string;
  status: ContentStatus;
  coverUrl: string | null;
  publishAt: Date | null;
  expiresAt: Date | null;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  merchant: { id: bigint; slug: string; name: string; logoUrl: string | null };
  window: MerchantWindowView | null;
};

type MerchantReplyView = {
  id: bigint;
  contentMd: string;
  contentHtml: string;
  status: ContentStatus;
  createdAt: Date;
  merchant: { id: bigint; slug: string; name: string; logoUrl: string | null };
};

@Injectable()
export class MerchantService {
  private readonly markdown = createSafeMarkdownRenderer();

  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
    private readonly food: FoodService,
  ) {}

  async getContext(account: MerchantPrincipal) {
    const merchantItems = account.isPlatformAdmin
      ? (
          await this.prisma.foodMerchant.findMany({
            where: { status: 'active' },
            orderBy: { name: 'asc' },
            include: {
              windows: {
                orderBy: [{ floor: 'asc' }, { name: 'asc' }],
                include: WINDOW_INCLUDE,
              },
            },
          })
        ).map((merchant) => ({ merchant, role: 'owner' as const }))
      : (
          await this.prisma.foodMerchantPortalStaff.findMany({
            where: { accountId: account.id, status: 'active', merchant: { status: 'active' } },
            orderBy: { createdAt: 'asc' },
            include: {
              merchant: {
                include: {
                  windows: {
                    orderBy: [{ floor: 'asc' }, { name: 'asc' }],
                    include: WINDOW_INCLUDE,
                  },
                },
              },
            },
          })
        ).map((membership) => ({ merchant: membership.merchant, role: membership.role }));
    return {
      account: {
        id: String(account.id),
        email: account.email,
        displayName: account.displayName,
        isPlatformAdmin: account.isPlatformAdmin,
      },
      merchants: merchantItems.map(({ merchant, role }) => ({
        id: String(merchant.id),
        slug: merchant.slug,
        name: merchant.name,
        description: merchant.description,
        logoUrl: merchant.logoUrl,
        contactDisplay: merchant.contactDisplay,
        status: merchant.status,
        role,
        windows: merchant.windows.map((window) => this.serializeWindow(window)),
      })),
    };
  }

  async updateMerchant(
    account: MerchantPrincipal,
    merchantId: string,
    data: UpdateMerchantProfileDto,
  ) {
    await this.requireMembership(account.id, merchantId, ['owner']);
    const id = this.parseId(merchantId);
    const updated = await this.prisma.foodMerchant.update({
      where: { id },
      data: {
        name: data.name !== undefined ? this.requireText(data.name, '店铺名称') : undefined,
        description: data.description !== undefined ? data.description.trim() || null : undefined,
        contactDisplay:
          data.contactDisplay !== undefined ? data.contactDisplay.trim() || null : undefined,
        logoUrl: data.logoUrl ? this.food.validateCoverUrl(data.logoUrl) : undefined,
      },
    });
    return {
      id: String(updated.id),
      slug: updated.slug,
      name: updated.name,
      description: updated.description,
      logoUrl: updated.logoUrl,
      contactDisplay: updated.contactDisplay,
      status: updated.status,
    };
  }

  async updateWindow(account: MerchantPrincipal, windowId: string, data: UpdateMerchantWindowDto) {
    const id = this.parseId(windowId);
    const window = await this.prisma.foodWindow.findUnique({
      where: { id },
      select: { merchantId: true },
    });
    if (!window) {
      throw new NotFoundException('窗口不存在');
    }
    await this.requireMembership(account.id, String(window.merchantId), ['owner', 'editor']);
    const updated = await this.prisma.foodWindow.update({
      where: { id },
      data: {
        name: data.name !== undefined ? this.requireText(data.name, '窗口名称') : undefined,
        windowNumber:
          data.windowNumber !== undefined ? data.windowNumber.trim() || null : undefined,
        locationDescription:
          data.locationDescription !== undefined
            ? data.locationDescription.trim() || null
            : undefined,
        isActive: data.isActive,
      },
      include: WINDOW_INCLUDE,
    });
    return this.serializeWindow(updated);
  }

  async listProducts(account: MerchantPrincipal, query: MerchantProductQueryDto) {
    const merchantIds = await this.merchantIds(account.id, query.merchantId);
    if (merchantIds.length === 0) {
      return [];
    }
    const products = await this.prisma.foodProduct.findMany({
      where: {
        merchantId: { in: merchantIds },
        ...(query.status ? { status: query.status as FoodProductStatus } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
      take: 200,
      include: { window: { include: WINDOW_INCLUDE } },
    });
    return products.map((product) => this.serializeProduct(product));
  }

  async createProduct(account: MerchantPrincipal, data: CreateMerchantProductDto) {
    const windowId = this.parseId(data.windowId);
    const window = await this.prisma.foodWindow.findUnique({
      where: { id: windowId },
      select: { merchantId: true, isActive: true },
    });
    if (!window || !window.isActive) {
      throw new BadRequestException('窗口不存在或已停用');
    }
    const membership = await this.requireMembership(account.id, String(window.merchantId), [
      'owner',
      'editor',
    ]);
    const description = data.description?.trim() || null;
    const moderated = await this.moderateProduct(description, account);
    const product = await this.prisma.foodProduct.create({
      data: {
        merchantId: membership.merchantId,
        windowId,
        name: this.requireText(data.name, '产品名称'),
        category: data.category?.trim() || null,
        description: moderated.content || null,
        priceCents: data.priceCents,
        imageUrl:
          data.imageUrl !== undefined
            ? data.imageUrl
              ? this.food.validateCoverUrl(data.imageUrl)
              : null
            : undefined,
        status: 'pending_review',
        isAvailable: data.isAvailable ?? true,
        sortOrder: data.sortOrder ?? 0,
        moderationLabels: this.moderation.moderationLabels(
          moderated,
        ) as unknown as Prisma.InputJsonValue,
        contentHash: moderated.contentHash,
      },
      include: { window: { include: WINDOW_INCLUDE } },
    });
    await this.moderation.recordCase(
      moderated,
      { surface: 'food_product' },
      product.id,
      description ?? product.name,
    );
    return this.serializeProduct(product);
  }

  async updateProduct(
    account: MerchantPrincipal,
    productId: string,
    data: UpdateMerchantProductDto,
  ) {
    const id = this.parseId(productId);
    const product = await this.prisma.foodProduct.findUnique({
      where: { id },
      select: { merchantId: true, windowId: true, name: true, description: true },
    });
    if (!product) {
      throw new NotFoundException('产品不存在');
    }
    await this.requireMembership(account.id, String(product.merchantId), ['owner', 'editor']);
    let windowId = product.windowId;
    if (data.windowId) {
      windowId = this.parseId(data.windowId);
      const targetWindow = await this.prisma.foodWindow.findFirst({
        where: { id: windowId, merchantId: product.merchantId, isActive: true },
        select: { id: true },
      });
      if (!targetWindow) {
        throw new BadRequestException('目标窗口不属于当前商家或已停用');
      }
    }
    const contentChanged = data.name !== undefined || data.description !== undefined;
    const listingChanged =
      contentChanged ||
      data.category !== undefined ||
      data.priceCents !== undefined ||
      data.imageUrl !== undefined ||
      data.windowId !== undefined;
    const name = data.name !== undefined ? this.requireText(data.name, '产品名称') : product.name;
    const description =
      data.description !== undefined ? data.description.trim() : (product.description ?? '');
    const moderated = contentChanged ? await this.moderateProduct(description, account) : null;
    const updated = await this.prisma.foodProduct.update({
      where: { id },
      data: {
        windowId,
        name: data.name !== undefined ? name : undefined,
        category: data.category !== undefined ? data.category?.trim() || null : undefined,
        description: contentChanged ? moderated?.content || null : undefined,
        priceCents: data.priceCents,
        imageUrl:
          data.imageUrl !== undefined
            ? data.imageUrl
              ? this.food.validateCoverUrl(data.imageUrl)
              : null
            : undefined,
        status: listingChanged ? 'pending_review' : undefined,
        isAvailable: data.isAvailable,
        sortOrder: data.sortOrder,
        ...(moderated
          ? {
              moderationLabels: this.moderation.moderationLabels(
                moderated,
              ) as unknown as Prisma.InputJsonValue,
              contentHash: moderated.contentHash,
            }
          : {}),
      },
      include: { window: { include: WINDOW_INCLUDE } },
    });
    if (moderated) {
      await this.moderation.recordCase(
        moderated,
        { surface: 'food_product' },
        id,
        description || updated.name,
      );
    }
    return this.serializeProduct(updated);
  }

  async submitProduct(account: MerchantPrincipal, productId: string) {
    const id = this.parseId(productId);
    const product = await this.prisma.foodProduct.findUnique({
      where: { id },
      select: { merchantId: true, status: true },
    });
    if (!product) {
      throw new NotFoundException('产品不存在');
    }
    await this.requireMembership(account.id, String(product.merchantId), ['owner', 'editor']);
    if (product.status === 'deleted') {
      throw new BadRequestException('已删除的产品不能重新上架');
    }
    const updated = await this.prisma.foodProduct.update({
      where: { id },
      data: { status: 'pending_review', isAvailable: true },
      include: { window: { include: WINDOW_INCLUDE } },
    });
    return this.serializeProduct(updated);
  }

  async listPosts(account: MerchantPrincipal, query: MerchantPostQueryDto) {
    const merchantIds = await this.merchantIds(account.id, query.merchantId);
    if (merchantIds.length === 0) {
      return [];
    }
    const posts = await this.prisma.foodPost.findMany({
      where: {
        merchantId: { in: merchantIds },
        ...(query.status ? { status: query.status as ContentStatus } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        merchant: { select: { id: true, slug: true, name: true, logoUrl: true } },
        window: { include: WINDOW_INCLUDE },
      },
    });
    return posts.map((post) => this.serializePost(post));
  }

  async createPost(account: MerchantPrincipal, data: CreateFoodPostDto) {
    const membership = await this.requireMembershipForWindow(account.id, data.windowId, [
      'owner',
      'editor',
    ]);
    const contentMd = this.requireText(data.contentMd, '内容');
    const title = this.requireText(data.title, '标题');
    const publishAt =
      data.publishAt && !Number.isNaN(data.publishAt.getTime()) ? data.publishAt : null;
    const expiresAt =
      data.expiresAt && !Number.isNaN(data.expiresAt.getTime()) ? data.expiresAt : null;
    if (data.publishAt && !publishAt) {
      throw new BadRequestException('发布时间无效');
    }
    if (data.expiresAt && !expiresAt) {
      throw new BadRequestException('失效时间无效');
    }
    if (expiresAt && publishAt && expiresAt <= publishAt) {
      throw new BadRequestException('失效时间必须晚于发布时间');
    }
    const moderated = await this.moderation.moderateOrThrow(contentMd, { surface: 'food_post' });
    const post = await this.prisma.foodPost.create({
      data: {
        merchantId: membership.merchantId,
        windowId: data.windowId ? this.parseId(data.windowId) : undefined,
        staffAccountId: account.id,
        type: data.type,
        title,
        contentMd: moderated.content,
        contentHtml: this.markdown.render(moderated.content),
        status: 'pending_review',
        coverUrl: data.coverUrl ? this.food.validateCoverUrl(data.coverUrl) : undefined,
        publishAt,
        expiresAt,
        moderationLabels: this.moderation.moderationLabels(
          moderated,
        ) as unknown as Prisma.InputJsonValue,
        contentHash: moderated.contentHash,
        legalHold: moderated.riskLevel >= 4,
      },
      include: {
        merchant: { select: { id: true, slug: true, name: true, logoUrl: true } },
        window: { include: WINDOW_INCLUDE },
      },
    });
    await this.moderation.recordCase(moderated, { surface: 'food_post' }, post.id, contentMd);
    return this.serializePost(post);
  }

  async updatePost(account: MerchantPrincipal, postId: string, data: UpdateMerchantPostDto) {
    const id = this.parseId(postId);
    const existing = await this.prisma.foodPost.findUnique({
      where: { id },
      select: {
        merchantId: true,
        windowId: true,
        contentMd: true,
        title: true,
        publishAt: true,
        expiresAt: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('宣传内容不存在');
    }
    await this.requireMembership(account.id, String(existing.merchantId), ['owner', 'editor']);

    let windowId = existing.windowId;
    if (data.windowId !== undefined) {
      const targetWindow = await this.prisma.foodWindow.findFirst({
        where: {
          id: this.parseId(data.windowId),
          merchantId: existing.merchantId,
          isActive: true,
        },
        select: { id: true },
      });
      if (!targetWindow) {
        throw new BadRequestException('目标窗口不属于当前商家或已停用');
      }
      windowId = targetWindow.id;
    }

    const contentChanged = data.contentMd !== undefined || data.title !== undefined;
    const contentMd =
      data.contentMd !== undefined ? this.requireText(data.contentMd, '内容') : existing.contentMd;
    const title = data.title !== undefined ? this.requireText(data.title, '标题') : existing.title;
    const publishAt =
      data.publishAt !== undefined
        ? this.parseOptionalDate(data.publishAt, '发布时间')
        : existing.publishAt;
    const expiresAt =
      data.expiresAt !== undefined
        ? this.parseOptionalDate(data.expiresAt, '失效时间')
        : existing.expiresAt;
    if (expiresAt && publishAt && expiresAt <= publishAt) {
      throw new BadRequestException('失效时间必须晚于发布时间');
    }
    const moderated = contentChanged
      ? await this.moderation.moderateOrThrow(contentMd, { surface: 'food_post' })
      : null;
    const updated = await this.prisma.foodPost.update({
      where: { id },
      data: {
        type: data.type,
        title,
        contentMd: moderated?.content,
        contentHtml: moderated ? this.markdown.render(moderated.content) : undefined,
        windowId,
        coverUrl:
          data.coverUrl !== undefined
            ? data.coverUrl
              ? this.food.validateCoverUrl(data.coverUrl)
              : null
            : undefined,
        publishAt: data.publishAt !== undefined ? publishAt : undefined,
        expiresAt: data.expiresAt !== undefined ? expiresAt : undefined,
        status: contentChanged ? 'pending_review' : undefined,
        ...(moderated
          ? {
              moderationLabels: this.moderation.moderationLabels(
                moderated,
              ) as unknown as Prisma.InputJsonValue,
              contentHash: moderated.contentHash,
              legalHold: moderated.riskLevel >= 4,
            }
          : {}),
      },
      include: {
        merchant: { select: { id: true, slug: true, name: true, logoUrl: true } },
        window: { include: WINDOW_INCLUDE },
      },
    });
    if (moderated) {
      await this.moderation.recordCase(moderated, { surface: 'food_post' }, id, contentMd);
    }
    return this.serializePost(updated);
  }

  async listReviews(account: MerchantPrincipal, query: MerchantReviewQueryDto) {
    const merchantIds = await this.merchantIds(account.id, query.merchantId);
    if (merchantIds.length === 0) {
      return [];
    }
    const reviews = await this.prisma.foodReview.findMany({
      where: {
        window: {
          merchantId: { in: merchantIds },
          ...(query.windowId ? { id: this.parseId(query.windowId) } : {}),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        window: { include: WINDOW_INCLUDE },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: { merchant: { select: { id: true, slug: true, name: true, logoUrl: true } } },
        },
      },
    });
    return reviews.map((review) => ({
      id: String(review.id),
      type: review.type,
      tasteScore: review.tasteScore,
      contentMd: review.contentMd,
      contentHtml: review.contentHtml,
      status: review.status,
      isAnonymous: review.isAnonymous,
      author: { type: 'anonymous' as const, displayName: '匿名同学' },
      window: this.serializeWindow(review.window),
      replies: review.replies.map((reply) => this.serializeReply(reply)),
      createdAt: review.createdAt.toISOString(),
    }));
  }

  async createReply(account: MerchantPrincipal, reviewId: string, data: MerchantReplyDto) {
    const id = this.parseId(reviewId);
    const review = await this.prisma.foodReview.findUnique({
      where: { id },
      select: { id: true, window: { select: { merchantId: true } } },
    });
    if (!review) {
      throw new NotFoundException('评价不存在');
    }
    const membership = await this.requireMembership(account.id, String(review.window.merchantId), [
      'owner',
      'editor',
    ]);
    const contentMd = this.requireText(data.contentMd, '回复内容');
    const moderated = await this.moderation.moderateOrThrow(contentMd, { surface: 'food_reply' });
    const reply = await this.prisma.foodReviewReply.create({
      data: {
        reviewId: id,
        merchantId: membership.merchantId,
        staffAccountId: account.id,
        contentMd: moderated.content,
        contentHtml: this.markdown.render(moderated.content),
        status: 'pending_review',
        moderationLabels: this.moderation.moderationLabels(
          moderated,
        ) as unknown as Prisma.InputJsonValue,
        contentHash: moderated.contentHash,
        legalHold: moderated.riskLevel >= 4,
      },
      include: { merchant: { select: { id: true, slug: true, name: true, logoUrl: true } } },
    });
    await this.moderation.recordCase(moderated, { surface: 'food_reply' }, reply.id, contentMd);
    return this.serializeReply(reply);
  }

  private async moderateProduct(description: string | null, _account: MerchantPrincipal) {
    if (!description) {
      return {
        content: '',
        status: 'published' as const,
        blocked: false,
        matches: [],
        reasonCodes: [],
        riskLevel: 0,
        contentHash: createHash('sha256').update('').digest('hex'),
      };
    }
    return this.moderation.moderateOrThrow(description, { surface: 'food_product' });
  }

  private parseOptionalDate(value: Date | undefined, label: string) {
    if (value === undefined) {
      return null;
    }
    if (Number.isNaN(value.getTime())) {
      throw new BadRequestException(`${label}无效`);
    }
    return value;
  }

  private async merchantIds(accountId: bigint, requested?: string) {
    if (await this.isPlatformAdmin(accountId)) {
      const merchants = await this.prisma.foodMerchant.findMany({
        where: { status: 'active', ...(requested ? { id: this.parseId(requested) } : {}) },
        select: { id: true },
      });
      return merchants.map((merchant) => merchant.id);
    }
    const memberships = await this.prisma.foodMerchantPortalStaff.findMany({
      where: {
        accountId,
        status: 'active',
        merchant: { status: 'active' },
        ...(requested ? { merchantId: this.parseId(requested) } : {}),
      },
      select: { merchantId: true },
    });
    return memberships.map((membership) => membership.merchantId);
  }

  private async requireMembership(accountId: bigint, merchantId: string, roles?: FoodStaffRole[]) {
    const id = this.parseId(merchantId);
    if (await this.isPlatformAdmin(accountId)) {
      const merchant = await this.prisma.foodMerchant.findFirst({
        where: { id, status: 'active' },
        select: { id: true },
      });
      if (!merchant) {
        throw new ForbiddenException('当前商家不存在或未启用');
      }
      return { merchantId: merchant.id, role: 'owner' as const };
    }
    const membership = await this.prisma.foodMerchantPortalStaff.findFirst({
      where: {
        accountId,
        merchantId: id,
        status: 'active',
        merchant: { status: 'active' },
        ...(roles ? { role: { in: roles } } : {}),
      },
      select: { merchantId: true, role: true },
    });
    if (!membership) {
      throw new ForbiddenException('当前账号没有该店铺的操作权限');
    }
    return membership;
  }

  private async isPlatformAdmin(accountId: bigint) {
    const account = await this.prisma.foodStaffAccount.findUnique({
      where: { id: accountId },
      select: {
        isPlatformAdmin: true,
        forumUser: { select: { role: true, status: true, deletedAt: true } },
      },
    });
    return Boolean(
      account?.isPlatformAdmin &&
      account.forumUser?.role === 'superadmin' &&
      account.forumUser.status === 'active' &&
      !account.forumUser.deletedAt,
    );
  }

  private async requireMembershipForWindow(
    accountId: bigint,
    windowId: string | undefined,
    roles: FoodStaffRole[],
  ) {
    if (!windowId) {
      throw new BadRequestException('请选择所属窗口');
    }
    const window = await this.prisma.foodWindow.findUnique({
      where: { id: this.parseId(windowId) },
      select: { merchantId: true, isActive: true },
    });
    if (!window || !window.isActive) {
      throw new BadRequestException('窗口不存在或已停用');
    }
    const membership = await this.requireMembership(accountId, String(window.merchantId), roles);
    return { ...membership, windowId: this.parseId(windowId) };
  }

  private serializeProduct(product: MerchantProductView) {
    return {
      id: String(product.id),
      merchantId: String(product.merchantId),
      name: product.name,
      category: product.category,
      description: product.description,
      priceCents: product.priceCents,
      imageUrl: product.imageUrl,
      status: product.status,
      isAvailable: product.isAvailable,
      sortOrder: product.sortOrder,
      window: product.window ? this.serializeWindow(product.window) : null,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  private serializePost(post: MerchantPostView) {
    return {
      id: String(post.id),
      type: post.type,
      title: post.title,
      contentMd: post.contentMd,
      contentHtml: post.contentHtml,
      status: post.status,
      coverUrl: post.coverUrl,
      publishAt: post.publishAt?.toISOString() ?? null,
      expiresAt: post.expiresAt?.toISOString() ?? null,
      isPinned: post.isPinned,
      merchant: {
        id: String(post.merchant.id),
        slug: post.merchant.slug,
        name: post.merchant.name,
        logoUrl: post.merchant.logoUrl,
      },
      window: post.window ? this.serializeWindow(post.window) : null,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    };
  }

  private serializeReply(reply: MerchantReplyView) {
    return {
      id: String(reply.id),
      contentMd: reply.contentMd,
      contentHtml: reply.contentHtml,
      status: reply.status,
      isOfficial: true,
      merchant: {
        id: String(reply.merchant.id),
        slug: reply.merchant.slug,
        name: reply.merchant.name,
        logoUrl: reply.merchant.logoUrl,
      },
      createdAt: reply.createdAt.toISOString(),
    };
  }

  private serializeWindow(window: MerchantWindowView) {
    return {
      id: String(window.id),
      floor: window.floor,
      name: window.name,
      windowNumber: window.windowNumber ?? null,
      locationDescription: window.locationDescription ?? null,
      isActive: window.isActive,
      canteen: {
        id: String(window.canteen.id),
        slug: window.canteen.slug,
        name: window.canteen.name,
      },
      merchant: window.merchant
        ? {
            id: String(window.merchant.id),
            slug: window.merchant.slug,
            name: window.merchant.name,
            logoUrl: window.merchant.logoUrl ?? null,
          }
        : undefined,
    };
  }

  private requireText(value: unknown, label: string) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${label}不能为空`);
    }
    return value.trim();
  }

  private parseId(value: string) {
    try {
      const id = BigInt(value);
      if (id <= 0n) {
        throw new Error('invalid');
      }
      return id;
    } catch {
      throw new BadRequestException('无效的 ID');
    }
  }
}

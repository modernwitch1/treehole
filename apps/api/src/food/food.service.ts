import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ContentStatus,
  FoodMerchantStatus,
  FoodProductStatus,
  FoodReviewType,
  FoodStaffRole,
  Prisma,
} from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { AppConfig } from '../config/app.config';
import { createSafeMarkdownRenderer } from '../common/safe-markdown';
import { ModerationService } from '../common/moderation.service';
import { PrismaService } from '../prisma/prisma.module';
import { parsePublicMediaKey, publicMediaUrl } from '../upload/media-url';
import type {
  CreateFoodCanteenDto,
  CreateMerchantPortalInvitationDto,
  CreateFoodMerchantDto,
  CreateFoodReviewDto,
  CreateFoodWindowDto,
  FoodAdminListQueryDto,
  FoodAdminContentListQueryDto,
  FoodAdminInvitationListQueryDto,
  FoodAdminProductListQueryDto,
  FoodAdminStaffListQueryDto,
  FoodFeedQueryDto,
  FoodReviewQueryDto,
  UpdateFoodCanteenDto,
  UpdateFoodMerchantDto,
  UpdateFoodStaffDto,
  UpdateFoodWindowDto,
} from './food.dto';

const PUBLIC_POST_INCLUDE = {
  merchant: { select: { id: true, slug: true, name: true, logoUrl: true } },
  window: {
    include: {
      canteen: { select: { id: true, slug: true, name: true } },
      products: {
        where: { status: 'published', isAvailable: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      },
    },
  },
} satisfies Prisma.FoodPostInclude;

const PUBLIC_REVIEW_INCLUDE = {
  author: { select: { username: true, avatarUrl: true } },
  window: {
    include: {
      canteen: { select: { id: true, slug: true, name: true } },
      merchant: { select: { id: true, slug: true, name: true, logoUrl: true } },
    },
  },
  replies: {
    where: { status: 'published' as const },
    orderBy: { createdAt: 'asc' as const },
    include: { merchant: { select: { id: true, slug: true, name: true, logoUrl: true } } },
  },
} satisfies Prisma.FoodReviewInclude;

type PublicPost = Prisma.FoodPostGetPayload<{ include: typeof PUBLIC_POST_INCLUDE }>;
type PublicReview = Prisma.FoodReviewGetPayload<{ include: typeof PUBLIC_REVIEW_INCLUDE }>;

@Injectable()
export class FoodService {
  private readonly markdown = createSafeMarkdownRenderer();

  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
    private readonly config: AppConfig,
  ) {}

  async listCanteens() {
    const canteens = await this.prisma.foodCanteen.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        windows: {
          where: { isActive: true, merchant: { status: 'active' } },
          orderBy: [{ floor: 'asc' }, { name: 'asc' }],
          include: {
            merchant: { select: { id: true, slug: true, name: true, logoUrl: true } },
            canteen: { select: { id: true, slug: true, name: true } },
            products: {
              where: { status: 'published', isAvailable: true },
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            },
          },
        },
      },
    });
    return canteens.map((canteen) => ({
      id: String(canteen.id),
      slug: canteen.slug,
      name: canteen.name,
      description: canteen.description,
      windows: canteen.windows.map((window) => this.serializeWindow(window)),
    }));
  }

  async getCanteen(slug: string) {
    const canteen = await this.prisma.foodCanteen.findFirst({
      where: { slug: slug.trim(), isActive: true },
      include: {
        windows: {
          where: { isActive: true, merchant: { status: 'active' } },
          orderBy: [{ floor: 'asc' }, { name: 'asc' }],
          include: {
            merchant: { select: { id: true, slug: true, name: true, logoUrl: true } },
            canteen: { select: { id: true, slug: true, name: true } },
            products: {
              where: { status: 'published', isAvailable: true },
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            },
          },
        },
      },
    });
    if (!canteen) {
      throw new NotFoundException('食堂不存在');
    }
    return {
      id: String(canteen.id),
      slug: canteen.slug,
      name: canteen.name,
      description: canteen.description,
      windows: canteen.windows.map((window) => this.serializeWindow(window)),
    };
  }

  async listMerchants(canteenSlug?: string) {
    const merchants = await this.prisma.foodMerchant.findMany({
      where: {
        status: 'active',
        ...(canteenSlug
          ? { windows: { some: { canteen: { slug: canteenSlug.trim() }, isActive: true } } }
          : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        windows: {
          where: { isActive: true, canteen: { isActive: true } },
          orderBy: [{ floor: 'asc' }, { name: 'asc' }],
          include: {
            canteen: { select: { id: true, slug: true, name: true } },
            products: {
              where: { status: 'published', isAvailable: true },
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            },
          },
        },
      },
    });
    return merchants.map((merchant) => this.serializeMerchant(merchant));
  }

  async getMerchant(slug: string) {
    const merchant = await this.prisma.foodMerchant.findFirst({
      where: { slug: slug.trim(), status: 'active' },
      include: {
        windows: {
          where: { isActive: true, canteen: { isActive: true } },
          orderBy: [{ floor: 'asc' }, { name: 'asc' }],
          include: {
            canteen: { select: { id: true, slug: true, name: true } },
            products: {
              where: { status: 'published', isAvailable: true },
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            },
          },
        },
      },
    });
    if (!merchant) {
      throw new NotFoundException('商家不存在');
    }
    return this.serializeMerchant(merchant);
  }

  async listFeed(query: FoodFeedQueryDto) {
    const now = new Date();
    const limit = query.limit ?? 20;
    const where: Prisma.FoodPostWhereInput = {
      status: 'published',
      merchant: { status: 'active' },
      AND: [
        { OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ...(query.canteen
          ? [{ window: { canteen: { slug: query.canteen.trim(), isActive: true } } }]
          : []),
        ...(query.merchant ? [{ merchant: { slug: query.merchant.trim() } }] : []),
      ],
    };
    const posts = await this.prisma.foodPost.findMany({
      where,
      orderBy: [{ isPinned: 'desc' }, { publishAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: this.parseId(query.cursor) } } : {}),
      include: PUBLIC_POST_INCLUDE,
    });
    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, limit) : posts;
    return {
      items: items.map((post) => this.serializePost(post)),
      nextCursor: hasMore ? String(items[items.length - 1]?.id) : undefined,
    };
  }

  async getPost(id: string) {
    const now = new Date();
    const post = await this.prisma.foodPost.findFirst({
      where: {
        id: this.parseId(id),
        status: 'published',
        merchant: { status: 'active' },
        AND: [
          { OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
      },
      include: PUBLIC_POST_INCLUDE,
    });
    if (!post) {
      throw new NotFoundException('美食内容不存在');
    }
    return this.serializePost(post);
  }

  async listWindowReviews(windowId: string, query: FoodReviewQueryDto) {
    const parsedWindowId = this.parseId(windowId);
    const window = await this.prisma.foodWindow.findFirst({
      where: { id: parsedWindowId, isActive: true, merchant: { status: 'active' } },
      select: { id: true },
    });
    if (!window) {
      throw new NotFoundException('窗口不存在');
    }
    const limit = query.limit ?? 20;
    const [reviews, aggregate] = await Promise.all([
      this.prisma.foodReview.findMany({
        where: { windowId: parsedWindowId, status: 'published' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(query.cursor ? { skip: 1, cursor: { id: this.parseId(query.cursor) } } : {}),
        include: PUBLIC_REVIEW_INCLUDE,
      }),
      this.prisma.foodReview.aggregate({
        where: { windowId: parsedWindowId, status: 'published', tasteScore: { not: null } },
        _avg: { tasteScore: true },
        _count: { _all: true },
      }),
    ]);
    const hasMore = reviews.length > limit;
    const items = hasMore ? reviews.slice(0, limit) : reviews;
    return {
      averageTasteScore: aggregate._avg.tasteScore
        ? Number(aggregate._avg.tasteScore.toFixed(1))
        : null,
      reviewCount: aggregate._count._all,
      items: items.map((review) => this.serializeReview(review)),
      nextCursor: hasMore ? String(items[items.length - 1]?.id) : undefined,
    };
  }

  async createReview(
    windowId: string,
    userId: bigint,
    data: CreateFoodReviewDto,
    ip?: string,
    userAgent?: string,
  ) {
    const parsedWindowId = this.parseId(windowId);
    const window = await this.prisma.foodWindow.findFirst({
      where: { id: parsedWindowId, isActive: true, merchant: { status: 'active' } },
      select: { id: true },
    });
    if (!window) {
      throw new NotFoundException('窗口不存在或暂不接受评价');
    }
    const contentMd = this.requireText(data.contentMd, '评价内容');
    if (data.type === 'taste_review' && data.tasteScore === undefined) {
      throw new BadRequestException('口味评价需要选择评分');
    }
    if (data.type === 'suggestion' && data.tasteScore !== undefined) {
      throw new BadRequestException('意见反馈不需要口味评分');
    }
    const moderated = await this.moderation.moderateOrThrow(contentMd, {
      surface: 'food_review',
      authorId: userId,
      ip,
      userAgent,
    });
    const createdReview = await this.prisma.foodReview.create({
      data: {
        windowId: parsedWindowId,
        authorId: userId,
        type: data.type as FoodReviewType,
        tasteScore: data.tasteScore,
        contentMd: moderated.content,
        contentHtml: this.markdown.render(moderated.content),
        isAnonymous: data.isAnonymous !== false,
        status: moderated.status,
        moderationLabels: this.moderation.moderationLabels(
          moderated,
        ) as unknown as Prisma.InputJsonValue,
        contentHash: moderated.contentHash,
        legalHold: moderated.riskLevel >= 4,
      },
      include: PUBLIC_REVIEW_INCLUDE,
    });
    if (moderated.status === 'pending_review') {
      await this.moderation.recordCase(
        moderated,
        {
          surface: 'food_review',
          authorId: userId,
          ip,
          userAgent,
        },
        createdReview.id,
        contentMd,
      );
    }
    const review = await this.prisma.foodReview.findUniqueOrThrow({
      where: { id: createdReview.id },
      include: PUBLIC_REVIEW_INCLUDE,
    });
    return this.serializeReview(review);
  }

  async adminListCanteens() {
    const canteens = await this.prisma.foodCanteen.findMany({
      orderBy: { name: 'asc' },
      include: {
        windows: {
          orderBy: [{ floor: 'asc' }, { name: 'asc' }],
          include: { canteen: { select: { id: true, slug: true, name: true } } },
        },
      },
    });
    return canteens.map((canteen) => ({
      id: String(canteen.id),
      slug: canteen.slug,
      name: canteen.name,
      description: canteen.description,
      isActive: canteen.isActive,
      windows: canteen.windows.map((window) => ({
        id: String(window.id),
        floor: window.floor,
        name: window.name,
        windowNumber: window.windowNumber,
        locationDescription: window.locationDescription,
        isActive: window.isActive,
        canteen: {
          id: String(window.canteen.id),
          slug: window.canteen.slug,
          name: window.canteen.name,
        },
      })),
    }));
  }

  async createCanteen(data: CreateFoodCanteenDto, adminId: bigint) {
    const slug = this.slug(data.slug);
    try {
      const canteen = await this.prisma.foodCanteen.create({
        data: {
          slug,
          name: this.requireText(data.name, '食堂名称'),
          description: data.description?.trim(),
        },
      });
      await this.audit(adminId, 'food.canteen.create', 'food_canteen', canteen.id, {
        slug: canteen.slug,
      });
      return { id: String(canteen.id), slug: canteen.slug, name: canteen.name };
    } catch (error) {
      if (this.isUniqueError(error)) {
        throw new ConflictException('食堂标识已存在');
      }
      throw error;
    }
  }

  async updateCanteen(id: string, data: UpdateFoodCanteenDto, adminId: bigint) {
    const canteenId = this.parseId(id);
    const canteen = await this.prisma.foodCanteen.findUnique({ where: { id: canteenId } });
    if (!canteen) {
      throw new NotFoundException('食堂不存在');
    }
    const updated = await this.prisma.foodCanteen.update({
      where: { id: canteenId },
      data: {
        name: data.name !== undefined ? this.requireText(data.name, '食堂名称') : undefined,
        description: data.description?.trim(),
        isActive: data.isActive,
      },
    });
    await this.audit(adminId, 'food.canteen.update', 'food_canteen', canteenId, {
      before: { name: canteen.name, isActive: canteen.isActive },
      after: { name: updated.name, isActive: updated.isActive },
    });
    return {
      id: String(updated.id),
      slug: updated.slug,
      name: updated.name,
      description: updated.description,
      isActive: updated.isActive,
    };
  }

  async adminListMerchants(query: FoodAdminListQueryDto) {
    const { page, pageSize } = this.normalizePagination(query.page, query.pageSize, 50);
    const where: Prisma.FoodMerchantWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { slug: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [merchants, total] = await Promise.all([
      this.prisma.foodMerchant.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          windows: { include: { canteen: { select: { id: true, slug: true, name: true } } } },
          _count: { select: { portalStaff: true, posts: true } },
        },
      }),
      this.prisma.foodMerchant.count({ where }),
    ]);
    return {
      items: merchants.map((merchant) => ({
        ...this.serializeMerchant(merchant),
        status: merchant.status,
        staffCount: merchant._count.portalStaff,
        postCount: merchant._count.posts,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async createMerchant(data: CreateFoodMerchantDto, adminId: bigint) {
    const slug = this.slug(data.slug);
    try {
      const merchant = await this.prisma.foodMerchant.create({
        data: {
          slug,
          name: this.requireText(data.name, '商家名称'),
          description: data.description?.trim(),
          contactDisplay: data.contactDisplay?.trim(),
          approvedBy: adminId,
          approvedAt: new Date(),
          status: 'active',
        },
      });
      await this.audit(adminId, 'food.merchant.create', 'food_merchant', merchant.id, {
        slug: merchant.slug,
      });
      return { id: String(merchant.id), slug: merchant.slug, name: merchant.name };
    } catch (error) {
      if (this.isUniqueError(error)) {
        throw new ConflictException('商家标识已存在');
      }
      throw error;
    }
  }

  async updateMerchant(id: string, data: UpdateFoodMerchantDto, adminId: bigint) {
    const merchantId = this.parseId(id);
    const merchant = await this.prisma.foodMerchant.findUnique({ where: { id: merchantId } });
    if (!merchant) {
      throw new NotFoundException('商家不存在');
    }
    const updated = await this.prisma.foodMerchant.update({
      where: { id: merchantId },
      data: {
        name: data.name !== undefined ? this.requireText(data.name, '商家名称') : undefined,
        description: data.description?.trim(),
        contactDisplay: data.contactDisplay?.trim(),
        status: data.status as FoodMerchantStatus | undefined,
        ...(data.status === 'active' ? { approvedBy: adminId, approvedAt: new Date() } : {}),
      },
    });
    await this.audit(adminId, 'food.merchant.update', 'food_merchant', merchantId, {
      before: { name: merchant.name, status: merchant.status },
      after: { name: updated.name, status: updated.status },
    });
    return {
      id: String(updated.id),
      slug: updated.slug,
      name: updated.name,
      status: updated.status,
    };
  }

  async createWindow(merchantId: string, data: CreateFoodWindowDto, adminId: bigint) {
    const parsedMerchantId = this.parseId(merchantId);
    const canteenId = this.parseId(data.canteenId);
    const [merchant, canteen] = await Promise.all([
      this.prisma.foodMerchant.findUnique({
        where: { id: parsedMerchantId },
        select: { id: true },
      }),
      this.prisma.foodCanteen.findFirst({
        where: { id: canteenId, isActive: true },
        select: { id: true },
      }),
    ]);
    if (!merchant) {
      throw new NotFoundException('商家不存在');
    }
    if (!canteen) {
      throw new NotFoundException('食堂不存在');
    }
    try {
      const window = await this.prisma.foodWindow.create({
        data: {
          merchantId: parsedMerchantId,
          canteenId,
          floor: data.floor ?? 2,
          name: this.requireText(data.name, '窗口名称'),
          windowNumber: data.windowNumber?.trim(),
          locationDescription: data.locationDescription?.trim(),
        },
        include: { canteen: { select: { id: true, slug: true, name: true } } },
      });
      await this.audit(adminId, 'food.window.create', 'food_window', window.id, {
        merchantId: String(parsedMerchantId),
        canteenId: String(canteenId),
      });
      return this.serializeWindow(window);
    } catch (error) {
      if (this.isUniqueError(error)) {
        throw new ConflictException('该食堂的窗口名称已存在');
      }
      throw error;
    }
  }

  async updateWindow(id: string, data: UpdateFoodWindowDto, adminId: bigint) {
    const windowId = this.parseId(id);
    const window = await this.prisma.foodWindow.findUnique({
      where: { id: windowId },
      select: {
        id: true,
        merchantId: true,
        name: true,
        windowNumber: true,
        floor: true,
        locationDescription: true,
        isActive: true,
      },
    });
    if (!window) {
      throw new NotFoundException('窗口不存在');
    }
    try {
      const updated = await this.prisma.foodWindow.update({
        where: { id: windowId },
        data: {
          name: data.name !== undefined ? this.requireText(data.name, '窗口名称') : undefined,
          windowNumber:
            data.windowNumber !== undefined ? data.windowNumber.trim() || null : undefined,
          floor: data.floor,
          locationDescription:
            data.locationDescription !== undefined
              ? data.locationDescription.trim() || null
              : undefined,
          isActive: data.isActive,
        },
        include: { canteen: { select: { id: true, slug: true, name: true } } },
      });
      await this.audit(adminId, 'food.window.update', 'food_window', windowId, {
        merchantId: String(window.merchantId),
        before: {
          name: window.name,
          windowNumber: window.windowNumber,
          floor: window.floor,
          locationDescription: window.locationDescription,
          isActive: window.isActive,
        },
        after: {
          name: updated.name,
          windowNumber: updated.windowNumber,
          floor: updated.floor,
          locationDescription: updated.locationDescription,
          isActive: updated.isActive,
        },
      });
      return this.serializeWindow(updated);
    } catch (error) {
      if (this.isUniqueError(error)) {
        throw new ConflictException('该食堂的窗口名称已存在');
      }
      throw error;
    }
  }

  async adminStats() {
    const [
      merchantStatuses,
      canteens,
      activeStaff,
      pendingInvitations,
      pendingProducts,
      pendingPosts,
      pendingReviews,
      pendingReplies,
    ] = await Promise.all([
      this.prisma.foodMerchant.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.foodCanteen.count({ where: { isActive: true } }),
      this.prisma.foodMerchantPortalStaff.count({ where: { status: 'active' } }),
      this.prisma.foodMerchantPortalInvitation.count({
        where: { status: 'pending', expiresAt: { gt: new Date() } },
      }),
      this.prisma.foodProduct.count({ where: { status: 'pending_review' } }),
      this.prisma.foodPost.count({ where: { status: 'pending_review' } }),
      this.prisma.foodReview.count({ where: { status: 'pending_review' } }),
      this.prisma.foodReviewReply.count({ where: { status: 'pending_review' } }),
    ]);
    return {
      merchants: Object.fromEntries(
        merchantStatuses.map((item) => [item.status, item._count._all]),
      ),
      activeCanteens: canteens,
      activeStaff,
      pendingInvitations,
      moderation: {
        products: pendingProducts,
        posts: pendingPosts,
        reviews: pendingReviews,
        replies: pendingReplies,
        total: pendingProducts + pendingPosts + pendingReviews + pendingReplies,
      },
    };
  }

  async adminListPosts(query: FoodAdminContentListQueryDto) {
    const { page, pageSize } = this.normalizePagination(query.page, query.pageSize, 50);
    const where: Prisma.FoodPostWhereInput = {
      ...(query.status ? { status: query.status as ContentStatus } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { contentMd: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [posts, total] = await Promise.all([
      this.prisma.foodPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          ...PUBLIC_POST_INCLUDE,
          author: { select: { id: true, username: true } },
          staffAuthor: { select: { id: true, displayName: true } },
        },
      }),
      this.prisma.foodPost.count({ where }),
    ]);
    return {
      items: posts.map((post) => ({
        ...this.serializePost(post, true),
        authorId: post.author ? String(post.author.id) : undefined,
        authorUsername: post.author?.username ?? post.staffAuthor?.displayName,
        authorType: post.staffAuthor ? 'merchant' : 'user',
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async adminListReviews(query: FoodAdminContentListQueryDto) {
    const { page, pageSize } = this.normalizePagination(query.page, query.pageSize, 50);
    const where: Prisma.FoodReviewWhereInput = {
      ...(query.status ? { status: query.status as ContentStatus } : {}),
      ...(query.q ? { contentMd: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [reviews, total] = await Promise.all([
      this.prisma.foodReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          ...PUBLIC_REVIEW_INCLUDE,
          author: { select: { id: true, username: true, avatarUrl: true } },
        },
      }),
      this.prisma.foodReview.count({ where }),
    ]);
    return {
      items: reviews.map((review) => ({
        ...this.serializeReview(review, true),
        authorId: String(review.author.id),
        authorUsername: review.author.username,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async adminListReplies(query: FoodAdminContentListQueryDto) {
    const { page, pageSize } = this.normalizePagination(query.page, query.pageSize, 50);
    const where: Prisma.FoodReviewReplyWhereInput = {
      ...(query.status ? { status: query.status as ContentStatus } : {}),
      ...(query.q ? { contentMd: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [replies, total] = await Promise.all([
      this.prisma.foodReviewReply.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          merchant: { select: { id: true, slug: true, name: true, logoUrl: true } },
          staffAuthor: { select: { displayName: true } },
          review: {
            select: {
              window: {
                select: {
                  id: true,
                  floor: true,
                  name: true,
                  canteen: { select: { id: true, slug: true, name: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.foodReviewReply.count({ where }),
    ]);
    return {
      items: replies.map((reply) => ({
        id: String(reply.id),
        contentMd: reply.contentMd,
        status: reply.status,
        authorUsername: reply.staffAuthor?.displayName ?? '商家官方',
        merchant: {
          id: String(reply.merchant.id),
          slug: reply.merchant.slug,
          name: reply.merchant.name,
          logoUrl: reply.merchant.logoUrl,
        },
        window: {
          id: String(reply.review.window.id),
          floor: reply.review.window.floor,
          name: reply.review.window.name,
          canteen: {
            id: String(reply.review.window.canteen.id),
            slug: reply.review.window.canteen.slug,
            name: reply.review.window.canteen.name,
          },
        },
        createdAt: reply.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async adminListProducts(query: FoodAdminProductListQueryDto) {
    const { page, pageSize } = this.normalizePagination(query.page, query.pageSize, 50);
    const where: Prisma.FoodProductWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.merchantId ? { merchantId: this.parseId(query.merchantId) } : {}),
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [products, total] = await Promise.all([
      this.prisma.foodProduct.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          merchant: { select: { id: true, slug: true, name: true, logoUrl: true } },
          window: { include: { canteen: { select: { id: true, slug: true, name: true } } } },
        },
      }),
      this.prisma.foodProduct.count({ where }),
    ]);
    return {
      items: products.map((product) => ({
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
        merchant: {
          id: String(product.merchant.id),
          slug: product.merchant.slug,
          name: product.merchant.name,
          logoUrl: product.merchant.logoUrl,
        },
        window: product.window
          ? {
              id: String(product.window.id),
              name: product.window.name,
              canteen: {
                id: String(product.window.canteen.id),
                slug: product.window.canteen.slug,
                name: product.window.canteen.name,
              },
            }
          : null,
        createdAt: product.createdAt.toISOString(),
        updatedAt: product.updatedAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async applyContentAction(
    kind: 'post' | 'product' | 'review' | 'reply',
    id: string,
    action: 'approve' | 'reject' | 'hide' | 'restore',
    adminId: bigint,
    note?: string,
  ) {
    const targetId = this.parseId(id);
    const status: ContentStatus =
      action === 'approve' || action === 'restore' ? 'published' : 'hidden';
    const surface =
      kind === 'post'
        ? 'food_post'
        : kind === 'product'
          ? 'food_product'
          : kind === 'review'
            ? 'food_review'
            : 'food_reply';
    if (kind === 'post') {
      const result = await this.prisma.foodPost.updateMany({
        where: { id: targetId },
        data: { status },
      });
      if (result.count !== 1) {
        throw new NotFoundException('美食内容不存在');
      }
    } else if (kind === 'product') {
      const result = await this.prisma.foodProduct.updateMany({
        where: { id: targetId },
        data: {
          status,
          deletedAt: null,
        },
      });
      if (result.count !== 1) {
        throw new NotFoundException('产品不存在');
      }
    } else if (kind === 'review') {
      const result = await this.prisma.foodReview.updateMany({
        where: { id: targetId },
        data: { status },
      });
      if (result.count !== 1) {
        throw new NotFoundException('评价不存在');
      }
    } else {
      const result = await this.prisma.foodReviewReply.updateMany({
        where: { id: targetId },
        data: { status },
      });
      if (result.count !== 1) {
        throw new NotFoundException('商家回复不存在');
      }
    }
    await this.prisma.moderationCase.updateMany({
      where: { surface, targetId },
      data: {
        status: 'resolved',
        decision: status === 'published' ? 'allow' : 'hide',
        resolutionNote: note?.trim(),
        resolvedBy: adminId,
        resolvedAt: new Date(),
      },
    });
    await this.audit(adminId, `food.${kind}.${action}`, `food_${kind}`, targetId, { note });
    return { ok: true, status };
  }

  async createPortalInvitation(
    merchantId: string,
    data: CreateMerchantPortalInvitationDto,
    adminId: bigint,
  ) {
    const parsedMerchantId = this.parseId(merchantId);
    const merchant = await this.prisma.foodMerchant.findFirst({
      where: { id: parsedMerchantId, status: 'active' },
      select: { id: true, slug: true, name: true },
    });
    if (!merchant) {
      throw new NotFoundException('商家不存在或未启用');
    }
    const email = data.email.trim().toLowerCase();
    const existingAccount = await this.prisma.foodStaffAccount.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingAccount) {
      throw new ConflictException('该邮箱已经有商家后台账号');
    }
    await this.prisma.foodMerchantPortalInvitation.updateMany({
      where: { merchantId: parsedMerchantId, email, status: 'pending' },
      data: { status: 'revoked', revokedAt: new Date() },
    });
    const token = randomBytes(32).toString('base64url');
    const invitation = await this.prisma.foodMerchantPortalInvitation.create({
      data: {
        merchantId: parsedMerchantId,
        email,
        tokenHash: this.hashToken(token),
        role: (data.role ?? 'editor') as FoodStaffRole,
        invitedBy: adminId,
        expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
      },
    });
    await this.audit(adminId, 'food.staff.invite', 'food_merchant', parsedMerchantId, {
      email,
      role: invitation.role,
    });
    return {
      id: invitation.id,
      email,
      role: invitation.role,
      merchant: { id: String(merchant.id), slug: merchant.slug, name: merchant.name },
      token,
      inviteUrl: `${this.config.get('MERCHANT_ORIGIN')}/invite?token=${encodeURIComponent(token)}`,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async adminListStaff(query: FoodAdminStaffListQueryDto) {
    const { page, pageSize } = this.normalizePagination(query.page, query.pageSize, 100);
    const where: Prisma.FoodMerchantPortalStaffWhereInput = {
      ...(query.merchantId ? { merchantId: this.parseId(query.merchantId) } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            account: {
              OR: [
                { email: { contains: query.q, mode: 'insensitive' } },
                { displayName: { contains: query.q, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const [staff, total] = await Promise.all([
      this.prisma.foodMerchantPortalStaff.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          account: { select: { id: true, displayName: true, email: true, status: true } },
          merchant: { select: { id: true, slug: true, name: true } },
        },
      }),
      this.prisma.foodMerchantPortalStaff.count({ where }),
    ]);
    return {
      items: staff.map((item) => ({
        id: String(item.id),
        role: item.role,
        status: item.status,
        joinedAt: item.joinedAt.toISOString(),
        revokedAt: item.revokedAt?.toISOString() ?? null,
        account: { ...item.account, id: String(item.account.id) },
        merchant: { ...item.merchant, id: String(item.merchant.id) },
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async adminListInvitations(query: FoodAdminInvitationListQueryDto) {
    const { page, pageSize } = this.normalizePagination(query.page, query.pageSize, 100);
    const now = new Date();
    const where: Prisma.FoodMerchantPortalInvitationWhereInput = {
      ...(query.merchantId ? { merchantId: this.parseId(query.merchantId) } : {}),
      ...(query.status === 'pending'
        ? { status: 'pending', expiresAt: { gt: now } }
        : query.status === 'expired'
          ? { OR: [{ status: 'expired' }, { status: 'pending', expiresAt: { lte: now } }] }
          : query.status
            ? { status: query.status }
            : {}),
    };
    const [invitations, total] = await Promise.all([
      this.prisma.foodMerchantPortalInvitation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          merchant: { select: { id: true, slug: true, name: true } },
          sender: { select: { id: true, username: true } },
          acceptedAccount: { select: { id: true, displayName: true, email: true } },
        },
      }),
      this.prisma.foodMerchantPortalInvitation.count({ where }),
    ]);
    return {
      items: invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status:
          invitation.status === 'pending' && invitation.expiresAt <= now
            ? 'expired'
            : invitation.status,
        expiresAt: invitation.expiresAt.toISOString(),
        acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
        revokedAt: invitation.revokedAt?.toISOString() ?? null,
        createdAt: invitation.createdAt.toISOString(),
        merchant: { ...invitation.merchant, id: String(invitation.merchant.id) },
        sender: { ...invitation.sender, id: String(invitation.sender.id) },
        acceptedAccount: invitation.acceptedAccount
          ? { ...invitation.acceptedAccount, id: String(invitation.acceptedAccount.id) }
          : null,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async revokeInvitation(id: string, adminId: bigint) {
    const invitationId = id;
    const invitation = await this.prisma.foodMerchantPortalInvitation.findUnique({
      where: { id: invitationId },
      select: { id: true, merchantId: true, status: true, email: true, expiresAt: true },
    });
    if (!invitation) {
      throw new NotFoundException('邀请不存在');
    }
    if (invitation.status !== 'pending') {
      throw new BadRequestException('只有待接受的邀请可以撤销');
    }
    if (invitation.expiresAt <= new Date()) {
      await this.prisma.foodMerchantPortalInvitation.update({
        where: { id: invitationId },
        data: { status: 'expired' },
      });
      throw new BadRequestException('邀请已过期');
    }
    await this.prisma.foodMerchantPortalInvitation.update({
      where: { id: invitationId },
      data: { status: 'revoked', revokedAt: new Date() },
    });
    await this.audit(
      adminId,
      'food.staff.invitation.revoke',
      'food_invitation',
      invitation.merchantId,
      {
        invitationId,
        email: invitation.email,
      },
    );
    return { ok: true };
  }

  async revokeStaff(id: string, adminId: bigint) {
    const staffId = this.parseId(id);
    const staff = await this.prisma.foodMerchantPortalStaff.findUnique({ where: { id: staffId } });
    if (!staff) {
      throw new NotFoundException('商家员工不存在');
    }
    await this.prisma.$transaction([
      this.prisma.foodMerchantPortalStaff.update({
        where: { id: staffId },
        data: { status: 'revoked', revokedAt: new Date() },
      }),
      this.prisma.foodMerchantSession.updateMany({
        where: { accountId: staff.accountId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: adminId,
          action: 'food.staff.revoke',
          targetType: 'food_staff',
          targetId: staffId,
        },
      }),
    ]);
    return { ok: true };
  }

  async updateStaff(id: string, data: UpdateFoodStaffDto, adminId: bigint) {
    const staffId = this.parseId(id);
    const staff = await this.prisma.foodMerchantPortalStaff.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        role: true,
        status: true,
        merchantId: true,
        merchant: { select: { name: true, status: true } },
        accountId: true,
      },
    });
    if (!staff) {
      throw new NotFoundException('商家员工不存在');
    }
    const nextStatus = data.status ?? staff.status;
    if (nextStatus === 'active' && staff.merchant.status !== 'active') {
      throw new BadRequestException('商家未启用，不能恢复员工权限');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const item = await tx.foodMerchantPortalStaff.update({
        where: { id: staffId },
        data: {
          role: data.role,
          status: data.status,
          revokedAt:
            data.status === 'active' ? null : data.status === 'revoked' ? new Date() : undefined,
        },
      });
      if (data.status === 'revoked') {
        await tx.foodMerchantSession.updateMany({
          where: { accountId: staff.accountId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: 'food.staff.update',
          targetType: 'food_staff',
          targetId: staffId,
          metadata: {
            merchant: staff.merchant.name,
            before: { role: staff.role, status: staff.status },
            after: { role: item.role, status: item.status },
          } as Prisma.InputJsonValue,
        },
      });
      return item;
    });
    return {
      id: String(updated.id),
      role: updated.role,
      status: updated.status,
      revokedAt: updated.revokedAt?.toISOString() ?? null,
    };
  }

  async report(
    kind: 'food_post' | 'food_review' | 'food_reply',
    id: string,
    userId: bigint,
    category: 'illegal' | 'porn' | 'ad' | 'harassment' | 'other',
    reason?: string,
  ) {
    const targetId = this.parseId(id);
    const exists =
      kind === 'food_post'
        ? await this.prisma.foodPost.findUnique({ where: { id: targetId }, select: { id: true } })
        : kind === 'food_review'
          ? await this.prisma.foodReview.findUnique({
              where: { id: targetId },
              select: { id: true },
            })
          : await this.prisma.foodReviewReply.findUnique({
              where: { id: targetId },
              select: { id: true },
            });
    if (!exists) {
      throw new NotFoundException('内容不存在');
    }
    await this.prisma.report.create({
      data: {
        reporterId: userId,
        targetType: kind,
        targetId,
        category,
        reason: reason?.trim().slice(0, 1000),
      },
    });
    return { ok: true };
  }

  private serializePost(post: PublicPost, includeInternalStatus = false) {
    return {
      id: String(post.id),
      type: post.type,
      title: post.title,
      contentMd: post.contentMd,
      contentHtml: post.contentHtml,
      status: includeInternalStatus ? post.status : undefined,
      coverUrl: post.coverUrl,
      publishAt: post.publishAt?.toISOString() ?? null,
      expiresAt: post.expiresAt?.toISOString() ?? null,
      isPinned: post.isPinned,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
      merchant: {
        id: String(post.merchant.id),
        slug: post.merchant.slug,
        name: post.merchant.name,
        logoUrl: post.merchant.logoUrl,
      },
      window: post.window ? this.serializeWindow(post.window) : null,
    };
  }

  private serializeReview(review: PublicReview, includeInternalStatus = false) {
    return {
      id: String(review.id),
      type: review.type,
      tasteScore: review.tasteScore,
      contentMd: review.contentMd,
      contentHtml: review.contentHtml,
      status: includeInternalStatus ? review.status : undefined,
      isAnonymous: review.isAnonymous,
      author: review.isAnonymous
        ? { type: 'anonymous' as const, displayName: '匿名同学' }
        : {
            type: 'user' as const,
            username: review.author.username,
            avatarUrl: review.author.avatarUrl,
          },
      replies: review.replies.map((reply) => this.serializeReply(reply)),
      window: {
        id: String(review.window.id),
        name: review.window.name,
        floor: review.window.floor,
        canteen: {
          id: String(review.window.canteen.id),
          slug: review.window.canteen.slug,
          name: review.window.canteen.name,
        },
        merchant: {
          id: String(review.window.merchant.id),
          slug: review.window.merchant.slug,
          name: review.window.merchant.name,
          logoUrl: review.window.merchant.logoUrl,
        },
      },
      createdAt: review.createdAt.toISOString(),
    };
  }

  private serializeReply(reply: {
    id: bigint;
    contentMd: string;
    contentHtml: string;
    status: ContentStatus;
    createdAt: Date;
    merchant: { id: bigint; slug: string; name: string; logoUrl: string | null };
  }) {
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

  private serializeMerchant(merchant: {
    id: bigint;
    slug: string;
    name: string;
    description: string | null;
    logoUrl: string | null;
    contactDisplay: string | null;
    status?: FoodMerchantStatus;
    windows: Array<{
      id: bigint;
      floor: number;
      name: string;
      windowNumber: string | null;
      locationDescription: string | null;
      canteen: { id: bigint; slug: string; name: string };
      products?: Array<{
        id: bigint;
        name: string;
        category: string | null;
        description: string | null;
        priceCents: number | null;
        imageUrl: string | null;
        status: FoodProductStatus;
        isAvailable: boolean;
        sortOrder: number;
      }>;
    }>;
  }) {
    return {
      id: String(merchant.id),
      slug: merchant.slug,
      name: merchant.name,
      description: merchant.description,
      logoUrl: merchant.logoUrl,
      contactDisplay: merchant.contactDisplay,
      ...(merchant.status ? { status: merchant.status } : {}),
      windows: merchant.windows.map((window) => this.serializeWindow(window)),
    };
  }

  private serializeWindow(window: {
    id: bigint;
    floor: number;
    name: string;
    windowNumber?: string | null;
    locationDescription?: string | null;
    merchant?: { id: bigint; slug: string; name: string; logoUrl?: string | null };
    canteen: { id: bigint; slug: string; name: string };
    products?: Array<{
      id: bigint;
      name: string;
      category: string | null;
      description: string | null;
      priceCents: number | null;
      imageUrl: string | null;
      status: FoodProductStatus;
      isAvailable: boolean;
      sortOrder: number;
    }>;
  }) {
    return {
      id: String(window.id),
      floor: window.floor,
      name: window.name,
      windowNumber: window.windowNumber ?? null,
      locationDescription: window.locationDescription ?? null,
      canteen: {
        id: String(window.canteen.id),
        slug: window.canteen.slug,
        name: window.canteen.name,
      },
      products: (window.products ?? []).map((product) => ({
        id: String(product.id),
        name: product.name,
        category: product.category,
        description: product.description,
        priceCents: product.priceCents,
        imageUrl: product.imageUrl,
        status: product.status,
        isAvailable: product.isAvailable,
        sortOrder: product.sortOrder,
      })),
      ...(window.merchant
        ? {
            merchant: {
              id: String(window.merchant.id),
              slug: window.merchant.slug,
              name: window.merchant.name,
              logoUrl: window.merchant.logoUrl ?? null,
            },
          }
        : {}),
    };
  }

  private async audit(
    actorId: bigint,
    action: string,
    targetType: string,
    targetId: bigint,
    metadata?: object,
  ) {
    await this.prisma.auditLog.create({
      data: { actorId, action, targetType, targetId, metadata: metadata as Prisma.InputJsonValue },
    });
  }

  private requireText(value: unknown, label: string) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${label}不能为空`);
    }
    return value.trim();
  }

  private normalizePagination(
    requestedPage: number | undefined,
    requestedPageSize: number | undefined,
    defaultPageSize: number,
  ) {
    const page =
      typeof requestedPage === 'number' && Number.isInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1;
    const pageSize =
      typeof requestedPageSize === 'number' &&
      Number.isInteger(requestedPageSize) &&
      requestedPageSize > 0
        ? Math.min(requestedPageSize, 100)
        : defaultPageSize;
    return { page, pageSize };
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

  private slug(value: string) {
    const result = value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$/.test(result) && !/^[a-z0-9]$/.test(result)) {
      throw new BadRequestException('标识只能使用小写字母、数字和连字符');
    }
    return result;
  }

  private hashToken(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private isUniqueError(error: unknown): error is { code: string } {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
  }

  validateCoverUrl(value: string | undefined) {
    if (!value) {
      return undefined;
    }
    const key = parsePublicMediaKey(value, 'food', this.config.get('CDN_BASE_URL'));
    return publicMediaUrl(key);
  }
}

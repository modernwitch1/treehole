import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { ModerationService } from '../common/moderation.service';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';
import { RedisService } from '../redis/redis.module';

type AuditMetadata = Record<string, string | number | boolean | null | undefined>;
type UserStatus = 'active' | 'suspended' | 'banned';
type UserRole = 'user' | 'moderator' | 'admin' | 'superadmin';
type ContentStatus = 'published' | 'pending_review' | 'hidden' | 'deleted';
type ReportStatus = 'open' | 'resolved' | 'rejected';
type AdminSensitiveCategory = 'illegal' | 'porn' | 'ad' | 'harassment' | 'other';
type PrismaSensitiveCategory = 'political' | 'porn' | 'violence' | 'ad' | 'other';
type SensitiveAction = 'block' | 'review' | 'mask';
type ReportTarget =
  | 'user'
  | 'post'
  | 'comment'
  | 'conversation'
  | 'direct_message'
  | 'chatroom_message';

export interface TrendRow {
  date: string;
  users: number;
  posts: number;
  comments: number;
  reports: number;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
    private readonly redis: RedisService,
  ) {}

  async getStats() {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      totalPosts,
      totalComments,
      openReports,
      pendingRegistrations,
      newUsersToday,
      newPostsToday,
      newCommentsToday,
      newReportsToday,
      pendingReviewPosts,
      pendingReviewComments,
      pendingReviewMessages,
      pendingReviewChatMessages,
      pendingUploads,
      pendingCases,
      pendingAppeals,
      trend,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.post.count(),
      this.prisma.comment.count(),
      this.prisma.report.count({ where: { status: 'open' } }),
      this.prisma.registrationRequest.count({
        where: { status: 'pending', expiresAt: { gt: now } },
      }),
      this.prisma.user.count({ where: { createdAt: { gte: today } } }),
      this.prisma.post.count({ where: { createdAt: { gte: today } } }),
      this.prisma.comment.count({ where: { createdAt: { gte: today } } }),
      this.prisma.report.count({ where: { createdAt: { gte: today } } }),
      this.prisma.post.count({ where: { status: 'pending_review' } }),
      this.prisma.comment.count({ where: { status: 'pending_review' } }),
      this.prisma.directMessage.count({ where: { status: 'pending_review' } }),
      this.prisma.chatroomMessage.count({ where: { status: 'pending_review' } }),
      this.prisma.upload.count({ where: { moderationStatus: 'pending' } }),
      this.prisma.moderationCase.count({ where: { status: { in: ['pending', 'in_review'] } } }),
      this.prisma.appeal.count({ where: { status: 'pending' } }),
      this.buildTrend(now),
    ]);

    return {
      totalUsers,
      totalPosts,
      totalComments,
      openReports,
      pendingRegistrations,
      newUsersToday,
      newPostsToday,
      newCommentsToday,
      newReportsToday,
      pendingReview:
        pendingReviewPosts +
        pendingReviewComments +
        pendingReviewMessages +
        pendingReviewChatMessages,
      pendingUploads,
      pendingCases,
      pendingAppeals,
      trend,
    };
  }

  async listUsers(
    opts: {
      q?: string;
      status?: UserStatus;
      role?: UserRole;
      page?: number;
      pageSize?: number;
    },
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    this.assertSuperadmin(admin, '只有超级管理员可以查看用户隐私信息');
    const q = opts.q?.trim().slice(0, 100);
    const { page, pageSize } = this.normalizePagination(opts.page, opts.pageSize);
    const skip = (page - 1) * pageSize;

    const where: Prisma.UserWhereInput = {
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.role ? { role: opts.role } : {}),
      ...(q
        ? {
            OR: [
              { username: { contains: q } },
              { email: { contains: q } },
              { bio: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          _count: { select: { posts: true, comments: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const reportCounts = await this.reportCounts(
      'user',
      users.map((user) => user.id),
    );
    const items = users.map((u) => {
      return {
        id: String(u.id),
        email: u.email,
        username: u.username,
        avatarUrl: u.avatarUrl ?? undefined,
        role: u.role,
        status: this.effectiveUserStatus(u.status, u.suspendedUntil),
        emailVerifiedAt: u.emailVerifiedAt?.toISOString() ?? null,
        suspendedUntil: u.suspendedUntil?.toISOString() ?? null,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        lastLoginIp: u.lastLoginIp ?? null,
        postCount: u._count.posts,
        commentCount: u._count.comments,
        reportCount: reportCounts.get(u.id) ?? 0,
        createdAt: u.createdAt.toISOString(),
      };
    });

    await this.audit(admin, 'users.privacy_list.view', 'user-list', undefined, ip, userAgent, {
      query: q ?? null,
      status: opts.status ?? null,
      role: opts.role ?? null,
      page,
      pageSize,
      resultCount: items.length,
      total,
      resultUserIds: users.map((user) => String(user.id)).join(','),
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async suspendUser(
    id: string,
    reasonValue: string,
    daysValue: number | undefined,
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    this.assertSuperadmin(admin, '只有超级管理员可以直接暂停指定用户');
    const reason = this.validateSanctionReason(reasonValue);
    const days =
      typeof daysValue === 'number' && Number.isInteger(daysValue)
        ? Math.min(Math.max(daysValue, 1), 30)
        : 7;
    const user = await this.getUserOrThrow(id);
    this.assertCanManageUser(admin, user);
    const sanctionEndsAt = new Date(Date.now() + days * 24 * 3600 * 1000);
    const suspendedUntil =
      user.status === 'suspended' && (!user.suspendedUntil || user.suspendedUntil > sanctionEndsAt)
        ? user.suspendedUntil
        : sanctionEndsAt;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { status: 'suspended', suspendedUntil },
      });
      await tx.sanction.create({
        data: {
          userId: user.id,
          type: 'suspension',
          reason,
          endsAt: sanctionEndsAt,
          imposedBy: this.parseId(admin.id),
        },
      });
      await this.audit(
        admin,
        'user.suspend',
        'user',
        user.id,
        ip,
        userAgent,
        {
          username: user.username,
          reason,
          days,
          suspendedUntil: suspendedUntil?.toISOString() ?? 'indefinite',
        },
        tx,
      );
    });
    await this.revokeUserSessions(user.id);
    return { ok: true };
  }

  async banUser(
    id: string,
    reasonValue: string,
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    this.assertSuperadmin(admin, '永久封禁只能由超级管理员执行');
    const reason = this.validateSanctionReason(reasonValue);
    const user = await this.getUserOrThrow(id);
    this.assertCanManageUser(admin, user);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { status: 'banned', suspendedUntil: null },
      });
      await tx.bannedEmail.upsert({
        where: { email: user.email },
        update: { reason, bannedBy: this.parseId(admin.id) },
        create: {
          email: user.email,
          reason,
          bannedBy: this.parseId(admin.id),
        },
      });
      await tx.sanction.create({
        data: {
          userId: user.id,
          type: 'ban',
          reason,
          imposedBy: this.parseId(admin.id),
        },
      });
      await this.audit(
        admin,
        'user.ban',
        'user',
        user.id,
        ip,
        userAgent,
        {
          username: user.username,
          email: user.email,
          reason,
        },
        tx,
      );
    });
    await this.revokeUserSessions(user.id);
    return { ok: true };
  }

  async unbanUser(
    id: string,
    reasonValue: string,
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    this.assertSuperadmin(admin, '解封只能由超级管理员执行');
    const reason = this.validateSanctionReason(reasonValue);
    const user = await this.getUserOrThrow(id);
    this.assertCanManageUser(admin, user);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { status: 'active', suspendedUntil: null },
      });
      await tx.bannedEmail.deleteMany({ where: { email: user.email } });
      await tx.sanction.updateMany({
        where: { userId: user.id, status: 'active' },
        data: {
          status: 'revoked',
          revokedBy: this.parseId(admin.id),
          revokedAt: now,
          revokeNote: reason,
        },
      });
      await this.audit(
        admin,
        'user.unban',
        'user',
        user.id,
        ip,
        userAgent,
        {
          username: user.username,
          email: user.email,
          reason,
        },
        tx,
      );
    });
    return { ok: true };
  }

  async setUserRole(
    id: string,
    role: 'moderator' | 'user',
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    this.assertSuperadmin(admin, '只有超级管理员可以变更角色');
    if (role !== 'moderator' && role !== 'user') {
      throw new BadRequestException('无效的用户角色');
    }
    const user = await this.getUserOrThrow(id);
    if (
      String(user.id) === admin.id ||
      user.role === 'superadmin' ||
      (user.role === 'admin' && admin.role !== 'superadmin')
    ) {
      throw new ForbiddenException('不能变更当前管理员或其他管理员的角色');
    }
    const oldRole = user.role;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { role } });
      await this.audit(
        admin,
        role === 'moderator' ? 'user.promote' : 'user.demote',
        'user',
        user.id,
        ip,
        userAgent,
        { username: user.username, from: oldRole, to: role },
        tx,
      );
    });
    if (role === 'user') {
      await this.revokeUserSessions(user.id);
    }
    return { ok: true };
  }

  async listReports(
    opts: { status?: ReportStatus; page?: number; pageSize?: number },
    admin: AdminPrincipal,
  ) {
    const { page, pageSize } = this.normalizePagination(opts.page, opts.pageSize);
    const skip = (page - 1) * pageSize;

    const where = opts.status ? { status: opts.status } : undefined;

    const [reports, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        skip,
        take: pageSize,
        include: {
          reporter: { select: { id: true, username: true } },
          handler: { select: { id: true, username: true } },
        },
      }),
      this.prisma.report.count({ where }),
    ]);

    const items = await Promise.all(
      reports.map(async (r) => ({
        id: String(r.id),
        reporter:
          admin.role === 'superadmin'
            ? { id: String(r.reporter.id), username: r.reporter.username }
            : { id: 'redacted', username: '已验证举报用户' },
        targetType: r.targetType,
        targetId: String(r.targetId),
        targetSnapshot:
          this.reportSnapshotFromEvidence(r.targetType, r.evidenceSnapshot) ??
          (await this.buildReportSnapshot(r.targetType, r.targetId, admin)),
        category: r.category,
        reason: r.reason ?? undefined,
        status: r.status,
        priority: r.priority,
        version: r.version,
        handledBy: r.handler ? { id: String(r.handler.id), username: r.handler.username } : null,
        handledAt: r.handledAt?.toISOString() ?? null,
        resolutionNote: r.resolutionNote ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    );

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async reviewReport(
    id: string,
    action: 'hide' | 'resolve' | 'reject',
    note: string | undefined,
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    if (!['hide', 'resolve', 'reject'].includes(action)) {
      throw new BadRequestException('无效的举报处理操作');
    }
    if (note && note.trim().length > 1000) {
      throw new BadRequestException('处理备注最多 1000 字');
    }
    const report = await this.prisma.report.findUnique({ where: { id: this.parseId(id) } });
    if (!report) {
      throw new NotFoundException('举报不存在');
    }
    if (report.status !== 'open') {
      throw new BadRequestException('该举报已被其他管理员处理');
    }
    if (action === 'hide' && report.targetType === 'user') {
      const target = await this.getUserOrThrow(String(report.targetId));
      this.assertCanManageUser(admin, target);
    }

    const handledAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.report.updateMany({
        where: { id: report.id, status: 'open', version: report.version },
        data: {
          status: action === 'reject' ? 'rejected' : 'resolved',
          handledBy: this.parseId(admin.id),
          handledAt,
          resolutionNote: note?.trim() || (action === 'hide' ? '已隐藏违规内容' : null),
          legalHold: action === 'hide' && report.legalHold,
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('该举报已被其他管理员处理');
      }
      if (action === 'hide') {
        await this.hideReportedTarget(tx, report.targetType, report.targetId);
        await tx.report.updateMany({
          where: {
            id: { not: report.id },
            targetType: report.targetType,
            targetId: report.targetId,
            status: 'open',
          },
          data: {
            status: 'resolved',
            handledBy: this.parseId(admin.id),
            handledAt,
            resolutionNote: '与已确认违规举报合并处理',
            version: { increment: 1 },
          },
        });
      } else {
        await this.releaseReportEvidenceHold(tx, report);
      }
      await this.audit(
        admin,
        `report.${action}`,
        'report',
        report.id,
        ip,
        userAgent,
        {
          note,
          targetType: report.targetType,
          targetId: String(report.targetId),
        },
        tx,
      );
    });
    if (action === 'hide' && report.targetType === 'user') {
      await this.revokeUserSessions(report.targetId);
    }
    return { ok: true };
  }

  async listPosts(
    opts: {
      q?: string;
      status?: ContentStatus;
      reported?: boolean;
      boardSlug?: string;
      page?: number;
      pageSize?: number;
    },
    _admin: AdminPrincipal,
  ) {
    const { page, pageSize } = this.normalizePagination(opts.page, opts.pageSize);
    const skip = (page - 1) * pageSize;
    const q = opts.q?.trim().slice(0, 100);
    const reportedIds = opts.reported
      ? (
          await this.prisma.report.findMany({
            where: { targetType: 'post' },
            distinct: ['targetId'],
            select: { targetId: true },
          })
        ).map((report) => report.targetId)
      : undefined;
    const where: Prisma.PostWhereInput = {
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.boardSlug ? { board: { slug: opts.boardSlug } } : {}),
      ...(reportedIds ? { id: { in: reportedIds } } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { contentMd: { contains: q, mode: 'insensitive' } },
              { board: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          board: { select: { slug: true, name: true } },
          author: { select: { id: true, username: true } },
        },
      }),
      this.prisma.post.count({ where }),
    ]);

    const reportCounts = await this.reportCounts(
      'post',
      posts.map((post) => post.id),
    );
    const items = posts.map((p) => ({
      id: String(p.id),
      boardSlug: p.board.slug,
      boardName: p.board.name,
      title: p.title,
      excerpt: p.contentMd.slice(0, 200),
      authorUsername: p.isAnonymous ? '浙小商' : p.author.username,
      authorId: p.isAnonymous ? undefined : String(p.author.id),
      isAnonymous: p.isAnonymous,
      status: p.status,
      upvotes: p.upvotes,
      downvotes: p.downvotes,
      score: p.score,
      commentCount: p.commentCount,
      reportCount: reportCounts.get(p.id) ?? 0,
      isPinned: p.isPinned,
      isLocked: p.isLocked,
      moderationLabels: p.moderationLabels,
      createdAt: p.createdAt.toISOString(),
    }));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async applyPostAction(
    id: string,
    action: 'hide' | 'restore' | 'pin' | 'unpin' | 'lock' | 'unlock' | 'delete',
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    if (!['hide', 'restore', 'pin', 'unpin', 'lock', 'unlock', 'delete'].includes(action)) {
      throw new BadRequestException('无效的帖子处理操作');
    }
    const post = await this.prisma.post.findUnique({ where: { id: this.parseId(id) } });
    if (!post) {
      throw new NotFoundException('帖子不存在');
    }
    if (action === 'delete') {
      this.assertSuperadmin(admin, '永久删除帖子只能由超级管理员执行');
    }
    const adminId = this.parseId(admin.id);
    const activeCases = await this.prisma.moderationCase.findMany({
      where: {
        surface: 'post',
        targetId: post.id,
        status: { in: ['pending', 'in_review'] },
      },
      select: { assignedTo: true },
    });
    if (
      action === 'restore' &&
      (post.status === 'pending_review' || post.legalHold || activeCases.length > 0)
    ) {
      throw new BadRequestException('待审或证据保全中的帖子必须通过案件/举报流程复核');
    }
    if (
      ['hide', 'delete'].includes(action) &&
      activeCases.some((item) => item.assignedTo && item.assignedTo !== adminId)
    ) {
      throw new BadRequestException('帖子案件已由其他管理员认领');
    }
    if (action === 'restore' && post.status === 'deleted') {
      this.assertSuperadmin(admin, '恢复已删除帖子只能由超级管理员执行');
    }

    const data = this.postActionData(action);
    await this.prisma.$transaction(async (tx) => {
      await tx.post.update({ where: { id: post.id }, data });
      if (['hide', 'restore', 'delete'].includes(action)) {
        await tx.moderationCase.updateMany({
          where: {
            surface: 'post',
            targetId: post.id,
            status: { in: ['pending', 'in_review'] },
            OR: [{ assignedTo: null }, { assignedTo: adminId }],
          },
          data: {
            status: 'resolved',
            decision: action === 'restore' ? 'allow' : action === 'delete' ? 'delete' : 'hide',
            resolvedBy: adminId,
            resolvedAt: new Date(),
            version: { increment: 1 },
          },
        });
      }
      await this.audit(
        admin,
        `post.${action}`,
        'post',
        post.id,
        ip,
        userAgent,
        {
          title: post.title,
        },
        tx,
      );
    });
    return { ok: true };
  }

  async revealPostAuthor(
    id: string,
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    this.assertSuperadmin(admin);
    const post = await this.prisma.post.findUnique({
      where: { id: this.parseId(id) },
      include: { author: { select: { id: true, username: true, email: true } } },
    });
    if (!post) {
      throw new NotFoundException('帖子不存在');
    }
    await this.audit(admin, 'post.reveal_author', 'post', post.id, ip, userAgent, {
      title: post.title,
      authorId: String(post.author.id),
    });
    return {
      id: String(post.author.id),
      username: post.author.username,
      email: post.author.email,
    };
  }

  async listComments(
    opts: {
      q?: string;
      status?: ContentStatus;
      reported?: boolean;
      page?: number;
      pageSize?: number;
    },
    _admin: AdminPrincipal,
  ) {
    const { page, pageSize } = this.normalizePagination(opts.page, opts.pageSize);
    const skip = (page - 1) * pageSize;
    const q = opts.q?.trim().slice(0, 100);
    const reportedIds = opts.reported
      ? (
          await this.prisma.report.findMany({
            where: { targetType: 'comment' },
            distinct: ['targetId'],
            select: { targetId: true },
          })
        ).map((report) => report.targetId)
      : undefined;
    const where: Prisma.CommentWhereInput = {
      ...(opts.status ? { status: opts.status } : {}),
      ...(reportedIds ? { id: { in: reportedIds } } : {}),
      ...(q
        ? {
            OR: [
              { contentMd: { contains: q, mode: 'insensitive' } },
              { post: { title: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [comments, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          author: { select: { id: true, username: true } },
          post: {
            select: {
              id: true,
              title: true,
              board: { select: { slug: true } },
            },
          },
        },
      }),
      this.prisma.comment.count({ where }),
    ]);

    const reportCounts = await this.reportCounts(
      'comment',
      comments.map((comment) => comment.id),
    );
    const items = comments.map((c) => ({
      id: String(c.id),
      postId: String(c.postId),
      postTitle: c.post.title,
      boardSlug: c.post.board.slug,
      excerpt: c.contentMd.slice(0, 200),
      authorUsername: c.isAnonymous ? '浙小商' : c.author.username,
      authorId: c.isAnonymous ? undefined : String(c.author.id),
      isAnonymous: c.isAnonymous,
      status: c.status,
      score: c.score,
      reportCount: reportCounts.get(c.id) ?? 0,
      moderationLabels: c.moderationLabels,
      createdAt: c.createdAt.toISOString(),
    }));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async applyCommentAction(
    id: string,
    action: 'hide' | 'restore' | 'delete',
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    if (!['hide', 'restore', 'delete'].includes(action)) {
      throw new BadRequestException('无效的评论处理操作');
    }
    const comment = await this.prisma.comment.findUnique({ where: { id: this.parseId(id) } });
    if (!comment) {
      throw new NotFoundException('评论不存在');
    }
    if (action === 'delete') {
      this.assertSuperadmin(admin, '永久删除评论只能由超级管理员执行');
    }
    const adminId = this.parseId(admin.id);
    const activeCases = await this.prisma.moderationCase.findMany({
      where: {
        surface: 'comment',
        targetId: comment.id,
        status: { in: ['pending', 'in_review'] },
      },
      select: { assignedTo: true },
    });
    if (
      action === 'restore' &&
      (comment.status === 'pending_review' || comment.legalHold || activeCases.length > 0)
    ) {
      throw new BadRequestException('待审或证据保全中的评论必须通过案件/举报流程复核');
    }
    if (
      ['hide', 'delete'].includes(action) &&
      activeCases.some((item) => item.assignedTo && item.assignedTo !== adminId)
    ) {
      throw new BadRequestException('评论案件已由其他管理员认领');
    }
    if (action === 'restore' && comment.status === 'deleted') {
      this.assertSuperadmin(admin, '恢复已删除评论只能由超级管理员执行');
    }

    const status: ContentStatus =
      action === 'restore' ? 'published' : action === 'delete' ? 'deleted' : 'hidden';
    await this.prisma.$transaction(async (tx) => {
      await tx.comment.update({
        where: { id: comment.id },
        data: {
          status,
          deletedAt: action === 'delete' ? new Date() : action === 'restore' ? null : undefined,
        },
      });
      const delta =
        status === 'published' && comment.status !== 'published'
          ? 1
          : status !== 'published' && comment.status === 'published'
            ? -1
            : 0;
      if (delta) {
        await tx.post.update({
          where: { id: comment.postId },
          data: { commentCount: { increment: delta } },
        });
      }
      await tx.moderationCase.updateMany({
        where: {
          surface: 'comment',
          targetId: comment.id,
          status: { in: ['pending', 'in_review'] },
          OR: [{ assignedTo: null }, { assignedTo: adminId }],
        },
        data: {
          status: 'resolved',
          decision: action === 'restore' ? 'allow' : action === 'delete' ? 'delete' : 'hide',
          resolvedBy: adminId,
          resolvedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await this.audit(
        admin,
        `comment.${action}`,
        'comment',
        comment.id,
        ip,
        userAgent,
        {
          excerpt: comment.contentMd.slice(0, 80),
        },
        tx,
      );
    });
    return { ok: true };
  }

  async revealCommentAuthor(
    id: string,
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    this.assertSuperadmin(admin);
    const comment = await this.prisma.comment.findUnique({
      where: { id: this.parseId(id) },
      include: { author: { select: { id: true, username: true, email: true } } },
    });
    if (!comment) {
      throw new NotFoundException('评论不存在');
    }
    await this.audit(admin, 'comment.reveal_author', 'comment', comment.id, ip, userAgent, {
      authorId: String(comment.author.id),
    });
    return {
      id: String(comment.author.id),
      username: comment.author.username,
      email: comment.author.email,
    };
  }

  async batchContentAction(
    input: { kind: 'post' | 'comment'; ids: string[]; action: 'approve' | 'hide' },
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    if (!['post', 'comment'].includes(input.kind) || !['approve', 'hide'].includes(input.action)) {
      throw new BadRequestException('无效的批量操作');
    }
    if (!Array.isArray(input.ids) || input.ids.length === 0 || input.ids.length > 100) {
      throw new BadRequestException('一次只能处理 1 到 100 条内容');
    }
    const ids = [...new Set(input.ids)].map((id) => this.parseId(id));
    const nextStatus: ContentStatus = input.action === 'approve' ? 'published' : 'hidden';
    const currentRows =
      input.kind === 'post'
        ? await this.prisma.post.findMany({
            where: { id: { in: ids } },
            select: { id: true, status: true, legalHold: true },
          })
        : await this.prisma.comment.findMany({
            where: { id: { in: ids } },
            select: { id: true, status: true, postId: true, legalHold: true },
          });
    if (currentRows.length !== ids.length) {
      throw new NotFoundException('部分内容不存在，请刷新后重试');
    }
    const adminId = this.parseId(admin.id);
    if (
      input.action === 'approve' &&
      currentRows.some((row) => row.status !== 'pending_review' || row.legalHold)
    ) {
      throw new BadRequestException('批量通过仅适用于未被证据保全的待审内容');
    }

    await this.prisma.$transaction(async (tx) => {
      if (input.action === 'approve') {
        if (input.kind === 'post') {
          const unapprovedUploads = await tx.upload.count({
            where: {
              attachedToType: 'post',
              attachedToId: { in: ids },
              moderationStatus: { not: 'passed' },
            },
          });
          if (unapprovedUploads > 0) {
            throw new BadRequestException('部分帖子仍有关联图片未通过审核');
          }
        }
        const claimedCases = await tx.moderationCase.updateMany({
          where: {
            surface: input.kind,
            targetId: { in: ids },
            status: { in: ['pending', 'in_review'] },
            riskLevel: { lt: 4 },
            legalHold: false,
            OR: [{ assignedTo: null }, { assignedTo: adminId }],
          },
          data: {
            status: 'resolved',
            decision: 'allow',
            resolvedBy: adminId,
            resolvedAt: new Date(),
            legalHold: false,
            version: { increment: 1 },
          },
        });
        if (claimedCases.count !== ids.length) {
          throw new BadRequestException(
            '部分内容风险过高、未关联案件、已被其他管理员认领或状态已变化',
          );
        }
      }

      if (input.kind === 'post') {
        const updated = await tx.post.updateMany({
          where: {
            id: { in: ids },
            ...(input.action === 'approve'
              ? { status: 'pending_review' as const, legalHold: false }
              : { status: { not: 'deleted' as const } }),
          },
          data: { status: nextStatus },
        });
        if (updated.count !== ids.length) {
          throw new BadRequestException('部分帖子状态已变化，请刷新后重试');
        }
      } else {
        const comments = currentRows as Array<{
          id: bigint;
          status: ContentStatus;
          postId: bigint;
          legalHold: boolean;
        }>;
        const updated = await tx.comment.updateMany({
          where: {
            id: { in: ids },
            ...(input.action === 'approve'
              ? { status: 'pending_review' as const, legalHold: false }
              : { status: { not: 'deleted' as const } }),
          },
          data: { status: nextStatus },
        });
        if (updated.count !== ids.length) {
          throw new BadRequestException('部分评论状态已变化，请刷新后重试');
        }
        const deltas = new Map<bigint, number>();
        for (const comment of comments) {
          const delta =
            nextStatus === 'published' && comment.status !== 'published'
              ? 1
              : nextStatus !== 'published' && comment.status === 'published'
                ? -1
                : 0;
          if (delta) {
            deltas.set(comment.postId, (deltas.get(comment.postId) ?? 0) + delta);
          }
        }
        for (const [postId, delta] of deltas) {
          await tx.post.update({
            where: { id: postId },
            data: { commentCount: { increment: delta } },
          });
        }
      }
      if (input.action === 'hide') {
        await tx.moderationCase.updateMany({
          where: {
            surface: input.kind,
            targetId: { in: ids },
            status: { in: ['pending', 'in_review'] },
            OR: [{ assignedTo: null }, { assignedTo: adminId }],
          },
          data: {
            status: 'resolved',
            decision: 'hide',
            resolvedBy: adminId,
            resolvedAt: new Date(),
            version: { increment: 1 },
          },
        });
      }
      await this.audit(
        admin,
        `content.batch.${input.action}`,
        input.kind,
        undefined,
        ip,
        userAgent,
        { count: ids.length, ids: ids.map(String).join(',') },
        tx,
      );
    });
    return { ok: true, processed: ids.length };
  }

  async listModerationCases(
    opts: {
      caseId?: string;
      status?: 'pending' | 'in_review' | 'resolved' | 'dismissed';
      surface?: 'post' | 'comment' | 'direct_message' | 'chatroom_message' | 'upload';
      minRisk?: number;
      assignedToMe?: boolean;
      page?: number;
      pageSize?: number;
    },
    admin: AdminPrincipal,
  ) {
    const { page, pageSize } = this.normalizePagination(opts.page, opts.pageSize);
    const where: Prisma.ModerationCaseWhereInput = {
      ...(opts.caseId ? { id: this.parseId(opts.caseId) } : {}),
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.surface ? { surface: opts.surface } : {}),
      ...(opts.minRisk ? { riskLevel: { gte: Math.min(Math.max(opts.minRisk, 0), 4) } } : {}),
      ...(opts.assignedToMe ? { assignedTo: this.parseId(admin.id) } : {}),
    };
    const [cases, total] = await Promise.all([
      this.prisma.moderationCase.findMany({
        where,
        orderBy: [{ riskLevel: 'desc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { assignee: { select: { id: true, username: true } } },
      }),
      this.prisma.moderationCase.count({ where }),
    ]);
    return {
      items: cases.map((item) => ({
        id: String(item.id),
        surface: item.surface,
        targetId: item.targetId ? String(item.targetId) : null,
        status: item.status,
        riskLevel: item.riskLevel,
        reasonCodes: item.reasonCodes,
        matchedRules: item.matchedRules,
        contentExcerpt: item.contentExcerpt,
        canRevealIdentity: admin.role === 'superadmin' && Boolean(item.authorId),
        assignedTo: item.assignee
          ? { id: String(item.assignee.id), username: item.assignee.username }
          : null,
        version: item.version,
        legalHold: item.legalHold,
        createdAt: item.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async claimModerationCase(
    id: string,
    version: number,
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    if (!Number.isInteger(version) || version < 1) {
      throw new BadRequestException('案件版本无效，请刷新后重试');
    }
    const caseId = this.parseId(id);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.moderationCase.updateMany({
        where: {
          id: caseId,
          version,
          status: { in: ['pending', 'in_review'] },
          OR: [{ assignedTo: null }, { assignedTo: this.parseId(admin.id) }],
        },
        data: {
          status: 'in_review',
          assignedTo: this.parseId(admin.id),
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('案件已被其他管理员认领或更新');
      }
      await this.audit(
        admin,
        'moderation-case.claim',
        'moderation-case',
        caseId,
        ip,
        userAgent,
        {
          version,
        },
        tx,
      );
    });
    return { ok: true };
  }

  async decideModerationCase(
    id: string,
    input: {
      version: number;
      decision: 'allow' | 'warn' | 'hide' | 'delete' | 'suspend' | 'ban';
      note: string;
      sanctionDays?: number;
    },
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    if (!Number.isInteger(input.version) || input.version < 1) {
      throw new BadRequestException('案件版本无效，请刷新后重试');
    }
    if (!['allow', 'warn', 'hide', 'delete', 'suspend', 'ban'].includes(input.decision)) {
      throw new BadRequestException('无效的审核决定');
    }
    if (
      input.sanctionDays !== undefined &&
      (!Number.isInteger(input.sanctionDays) || input.sanctionDays < 1 || input.sanctionDays > 30)
    ) {
      throw new BadRequestException('暂停天数必须是 1 到 30 之间的整数');
    }
    const caseId = this.parseId(id);
    const note = input.note?.trim();
    if (!note || note.length < 3 || note.length > 1000) {
      throw new BadRequestException('请填写 3 到 1000 字的处理说明');
    }
    if (input.decision === 'ban' || input.decision === 'delete') {
      this.assertSuperadmin(admin, '永久封禁或删除只能由超级管理员执行');
    }
    const moderationCase = await this.prisma.moderationCase.findUnique({
      where: { id: caseId },
    });
    if (!moderationCase) {
      throw new NotFoundException('审核案件不存在');
    }
    const targetId = moderationCase.targetId;
    if (!targetId && ['hide', 'delete'].includes(input.decision)) {
      throw new BadRequestException('发送前已拦截的内容无需再次隐藏或删除');
    }
    if (['warn', 'suspend', 'ban'].includes(input.decision)) {
      if (!moderationCase.authorId) {
        throw new BadRequestException('该案件没有可处罚的关联用户');
      }
      const targetUser = await this.getUserOrThrow(String(moderationCase.authorId));
      this.assertCanManageUser(admin, targetUser);
    }

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.moderationCase.updateMany({
        where: {
          id: caseId,
          version: input.version,
          status: { in: ['pending', 'in_review'] },
          OR: [{ assignedTo: null }, { assignedTo: this.parseId(admin.id) }],
        },
        data: {
          status: input.decision === 'allow' ? 'dismissed' : 'resolved',
          decision: input.decision,
          resolutionNote: note,
          resolvedBy: this.parseId(admin.id),
          resolvedAt: new Date(),
          legalHold:
            input.decision === 'allow' || input.decision === 'warn'
              ? false
              : moderationCase.legalHold,
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('案件已被其他管理员更新');
      }

      if (targetId) {
        await this.applyModerationDecision(tx, moderationCase.surface, targetId, input.decision);
        if (input.decision === 'allow' || input.decision === 'warn') {
          await this.releaseModerationCaseEvidenceHold(
            tx,
            moderationCase.surface,
            targetId,
            caseId,
          );
        }
      }
      if (moderationCase.authorId && ['warn', 'suspend', 'ban'].includes(input.decision)) {
        const days = Math.min(Math.max(input.sanctionDays ?? 7, 1), 30);
        const sanctionEndsAt =
          input.decision === 'suspend' ? new Date(Date.now() + days * 86400_000) : null;
        await tx.sanction.create({
          data: {
            userId: moderationCase.authorId,
            caseId,
            type:
              input.decision === 'warn'
                ? 'warning'
                : input.decision === 'ban'
                  ? 'ban'
                  : 'suspension',
            reason: note,
            endsAt: sanctionEndsAt,
            imposedBy: this.parseId(admin.id),
          },
        });
        if (input.decision === 'suspend' && sanctionEndsAt) {
          const currentUser = await tx.user.findUniqueOrThrow({
            where: { id: moderationCase.authorId },
            select: { status: true, suspendedUntil: true },
          });
          const suspendedUntil =
            currentUser.status === 'suspended' &&
            (!currentUser.suspendedUntil || currentUser.suspendedUntil > sanctionEndsAt)
              ? currentUser.suspendedUntil
              : sanctionEndsAt;
          await tx.user.update({
            where: { id: moderationCase.authorId },
            data: {
              status: 'suspended',
              suspendedUntil,
            },
          });
        } else if (input.decision === 'ban') {
          await tx.user.update({
            where: { id: moderationCase.authorId },
            data: { status: 'banned', suspendedUntil: null },
          });
        }
      }
      if (moderationCase.authorId) {
        const notificationTitle: Record<typeof input.decision, string> = {
          allow: '你的内容已通过审核',
          warn: '你的内容已通过审核并收到警告',
          hide: '你的内容已被隐藏',
          delete: '你的内容已被删除',
          suspend: '你的账号已被暂停使用',
          ban: '你的账号已被永久封禁',
        };
        await tx.notification.create({
          data: {
            recipientId: moderationCase.authorId,
            type: 'system',
            payload: {
              title: notificationTitle[input.decision],
              body: note.slice(0, 300),
              linkUrl:
                moderationCase.surface === 'post' && targetId ? `/p/${targetId}` : '/settings',
              moderationCaseId: String(caseId),
            },
          },
        });
      }
      await this.audit(
        admin,
        'moderation-case.decide',
        'moderation-case',
        caseId,
        ip,
        userAgent,
        { decision: input.decision, note },
        tx,
      );
    });
    if (moderationCase.authorId && ['suspend', 'ban'].includes(input.decision)) {
      await this.revokeUserSessions(moderationCase.authorId);
    }
    return { ok: true };
  }

  async revealModerationCaseAuthor(
    id: string,
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    this.assertSuperadmin(admin);
    const caseId = this.parseId(id);
    const moderationCase = await this.prisma.moderationCase.findUnique({
      where: { id: caseId },
      include: {
        author: { select: { id: true, username: true, email: true } },
      },
    });
    if (!moderationCase) {
      throw new NotFoundException('审核案件不存在');
    }
    if (!moderationCase.author) {
      throw new BadRequestException('该案件没有可供溯源的关联用户');
    }

    await this.audit(
      admin,
      'moderation-case.reveal_author',
      'moderation-case',
      caseId,
      ip,
      userAgent,
      {
        surface: moderationCase.surface,
        targetId: moderationCase.targetId ? String(moderationCase.targetId) : null,
        authorId: String(moderationCase.author.id),
      },
    );
    return {
      id: String(moderationCase.author.id),
      username: moderationCase.author.username,
      email: moderationCase.author.email,
    };
  }

  async listPendingUploads(opts: { page?: number; pageSize?: number }) {
    const { page, pageSize } = this.normalizePagination(opts.page, opts.pageSize);
    const [uploads, total] = await Promise.all([
      this.prisma.upload.findMany({
        where: { moderationStatus: { in: ['pending', 'flagged'] } },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          s3Key: true,
          mimeType: true,
          sizeBytes: true,
          width: true,
          height: true,
          moderationStatus: true,
          moderationLabels: true,
          attachedToType: true,
          attachedToId: true,
          createdAt: true,
        },
      }),
      this.prisma.upload.count({ where: { moderationStatus: { in: ['pending', 'flagged'] } } }),
    ]);
    return {
      items: uploads.map((upload) => ({
        ...upload,
        id: upload.id,
        attachedToId: upload.attachedToId ? String(upload.attachedToId) : null,
        createdAt: upload.createdAt.toISOString(),
        previewUrl: `/api/v1/admin/uploads/${upload.id}/preview`,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async listAppeals(
    opts: {
      status?: 'pending' | 'approved' | 'rejected';
      page?: number;
      pageSize?: number;
    },
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    this.assertSuperadmin(admin, '只有超级管理员可以复核处罚申诉');
    const { page, pageSize } = this.normalizePagination(opts.page, opts.pageSize);
    await this.prisma.sanction.updateMany({
      where: { status: 'active', endsAt: { lte: new Date() } },
      data: { status: 'expired' },
    });
    const where = opts.status ? { status: opts.status } : undefined;
    const [appeals, total] = await Promise.all([
      this.prisma.appeal.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, username: true, email: true, status: true } },
          reviewer: { select: { id: true, username: true } },
          sanction: {
            include: {
              imposer: { select: { id: true, username: true } },
            },
          },
        },
      }),
      this.prisma.appeal.count({ where }),
    ]);
    const items = appeals.map((appeal) => ({
      id: String(appeal.id),
      reason: appeal.reason,
      status: appeal.status,
      reviewNote: appeal.reviewNote,
      reviewedAt: appeal.reviewedAt?.toISOString() ?? null,
      createdAt: appeal.createdAt.toISOString(),
      user: {
        id: String(appeal.user.id),
        username: appeal.user.username,
        email: appeal.user.email,
        status: appeal.user.status,
      },
      reviewer: appeal.reviewer
        ? { id: String(appeal.reviewer.id), username: appeal.reviewer.username }
        : null,
      sanction: {
        id: String(appeal.sanction.id),
        caseId: appeal.sanction.caseId ? String(appeal.sanction.caseId) : null,
        type: appeal.sanction.type,
        status: appeal.sanction.status,
        scope: appeal.sanction.scope,
        policyRule: appeal.sanction.policyRule,
        reason: appeal.sanction.reason,
        startsAt: appeal.sanction.startsAt.toISOString(),
        endsAt: appeal.sanction.endsAt?.toISOString() ?? null,
        imposedBy: appeal.sanction.imposer
          ? {
              id: String(appeal.sanction.imposer.id),
              username: appeal.sanction.imposer.username,
            }
          : null,
      },
    }));
    await this.audit(admin, 'appeals.privacy_list.view', 'appeal-list', undefined, ip, userAgent, {
      status: opts.status ?? null,
      page,
      pageSize,
      resultCount: items.length,
      total,
      resultUserIds: appeals.map((appeal) => String(appeal.userId)).join(','),
    });
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async reviewAppeal(
    id: string,
    action: 'approve' | 'reject',
    noteValue: string,
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    this.assertSuperadmin(admin, '只有超级管理员可以复核处罚申诉');
    if (!['approve', 'reject'].includes(action)) {
      throw new BadRequestException('无效的申诉处理操作');
    }
    const note = noteValue?.trim();
    if (!note || note.length < 5 || note.length > 1000) {
      throw new BadRequestException('请填写 5 到 1000 字的复核说明');
    }
    const appealId = this.parseId(id);
    const appeal = await this.prisma.appeal.findUnique({
      where: { id: appealId },
      include: { sanction: true, user: true },
    });
    if (!appeal) {
      throw new NotFoundException('申诉不存在');
    }
    if (appeal.status !== 'pending') {
      throw new BadRequestException('该申诉已被其他管理员处理');
    }
    const adminId = this.parseId(admin.id);
    if (appeal.userId === adminId) {
      throw new ForbiddenException('不能复核与自己账号相关的处罚申诉');
    }
    if (appeal.sanction.imposedBy === adminId) {
      throw new ForbiddenException('原处罚人员不能单独复核该申诉，请交由其他管理员处理');
    }

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.appeal.updateMany({
        where: { id: appealId, status: 'pending' },
        data: {
          status: action === 'approve' ? 'approved' : 'rejected',
          reviewedBy: adminId,
          reviewNote: note,
          reviewedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('该申诉已被其他管理员处理');
      }

      if (action === 'approve') {
        await tx.sanction.updateMany({
          where: { id: appeal.sanctionId, userId: appeal.userId, status: { not: 'revoked' } },
          data: {
            status: 'revoked',
            revokedBy: adminId,
            revokedAt: new Date(),
            revokeNote: `申诉复核通过：${note}`,
          },
        });
        await tx.sanction.updateMany({
          where: {
            userId: appeal.userId,
            status: 'active',
            endsAt: { lte: new Date() },
          },
          data: { status: 'expired' },
        });
        const remaining = await tx.sanction.findMany({
          where: { userId: appeal.userId, status: 'active' },
          select: { type: true, endsAt: true },
        });
        const hasBan = remaining.some((sanction) => sanction.type === 'ban');
        const suspensions = remaining.filter(
          (sanction) => sanction.type === 'suspension' || sanction.type === 'mute',
        );
        const indefiniteSuspension = suspensions.some((sanction) => !sanction.endsAt);
        const latestSuspensionEnd = suspensions
          .map((sanction) => sanction.endsAt)
          .filter((value): value is Date => Boolean(value))
          .sort((left, right) => right.getTime() - left.getTime())[0];
        await tx.user.update({
          where: { id: appeal.userId },
          data: hasBan
            ? { status: 'banned', suspendedUntil: null }
            : suspensions.length > 0
              ? {
                  status: 'suspended',
                  suspendedUntil: indefiniteSuspension ? null : latestSuspensionEnd,
                }
              : { status: 'active', suspendedUntil: null },
        });
        if (!hasBan) {
          await tx.bannedEmail.deleteMany({ where: { email: appeal.user.email } });
        }
      }

      await tx.notification.create({
        data: {
          recipientId: appeal.userId,
          type: 'system',
          payload: {
            title: action === 'approve' ? '你的处罚申诉已通过' : '你的处罚申诉已完成复核',
            body: note.slice(0, 300),
            linkUrl: '/banned',
          },
        },
      });
      await this.audit(
        admin,
        `appeal.${action}`,
        'appeal',
        appealId,
        ip,
        userAgent,
        {
          sanctionId: String(appeal.sanctionId),
          userId: String(appeal.userId),
          note,
        },
        tx,
      );
    });
    if (action === 'approve') {
      await this.revokeUserSessions(appeal.userId);
      await this.revokeAppealSessions(appeal.userId);
    }
    return { ok: true };
  }

  async reviewUpload(
    id: string,
    action: 'approve' | 'reject',
    note: string | undefined,
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    if (!['approve', 'reject'].includes(action)) {
      throw new BadRequestException('无效的图片操作');
    }
    const normalizedNote = note?.trim();
    if (normalizedNote && normalizedNote.length > 500) {
      throw new BadRequestException('图片审核说明最多 500 字');
    }
    if (action === 'reject' && (!normalizedNote || normalizedNote.length < 3)) {
      throw new BadRequestException('驳回图片时必须填写至少 3 个字的审核依据');
    }
    const upload = await this.prisma.upload.findUnique({ where: { id } });
    if (!upload) {
      throw new NotFoundException('图片不存在');
    }
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.upload.updateMany({
        where: { id, moderationStatus: { in: ['pending', 'flagged'] } },
        data: {
          moderationStatus: action === 'approve' ? 'passed' : 'rejected',
          moderationLabels: {
            reviewedBy: admin.id,
            reviewNote: normalizedNote || null,
            reviewedAt: new Date().toISOString(),
          },
          legalHold: action === 'reject' ? true : false,
        },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('图片已被其他管理员处理，请刷新后重试');
      }
      if (action === 'reject' && upload.attachedToType === 'post' && upload.attachedToId) {
        await tx.post.update({
          where: { id: upload.attachedToId },
          data: { status: 'hidden', legalHold: true },
        });
      }
      await this.audit(
        admin,
        `upload.${action}`,
        'upload',
        undefined,
        ip,
        userAgent,
        {
          uploadId: id,
          note: normalizedNote,
        },
        tx,
      );
    });
    return { ok: true };
  }

  async listAuditLogs(
    opts: { page?: number; pageSize?: number },
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    this.assertSuperadmin(admin, '只有超级管理员可以查看审计日志');
    const { page, pageSize } = this.normalizePagination(opts.page, opts.pageSize);
    const skip = (page - 1) * pageSize;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: { actor: { select: { id: true, username: true, role: true } } },
      }),
      this.prisma.auditLog.count(),
    ]);

    const items = logs.map((log) => {
      const metadata = this.asMetadata(log.metadata);
      return {
        id: String(log.id),
        actor: log.actor
          ? { id: String(log.actor.id), username: log.actor.username, role: log.actor.role }
          : {
              id: String(metadata?.actorId ?? 'admin'),
              username: String(metadata?.actorUsername ?? '管理员'),
              role: String(metadata?.actorRole ?? 'admin') as UserRole,
            },
        action: log.action,
        targetType: log.targetType ?? undefined,
        targetId: log.targetId ? String(log.targetId) : undefined,
        metadata,
        ip: log.ip ?? undefined,
        createdAt: log.createdAt.toISOString(),
      };
    });

    await this.audit(admin, 'audit-log.list.view', 'audit-log', undefined, ip, userAgent, {
      page,
      pageSize,
      resultCount: items.length,
      total,
      resultAuditLogIds: logs.map((log) => String(log.id)).join(','),
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async listAnnouncements(opts: { page?: number; pageSize?: number }) {
    const { page, pageSize } = this.normalizePagination(opts.page, opts.pageSize);
    const skip = (page - 1) * pageSize;

    const [announcements, total] = await Promise.all([
      this.prisma.systemAnnouncement.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: { publisher: { select: { username: true } } },
      }),
      this.prisma.systemAnnouncement.count(),
    ]);

    const items = announcements.map((announcement) => ({
      id: String(announcement.id),
      title: announcement.title,
      body: announcement.body,
      linkUrl: announcement.linkUrl ?? undefined,
      audience: announcement.audience,
      recipientCount: announcement.recipientCount,
      publishedBy: announcement.publisher.username,
      createdAt: announcement.createdAt.toISOString(),
    }));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async publishAnnouncement(
    input: { title: string; body: string; linkUrl?: string },
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    this.assertSuperadmin(admin);
    const title = input.title.trim();
    const body = input.body.trim();
    const linkUrl = input.linkUrl?.trim() || null;
    if (!title) {
      throw new BadRequestException('通知标题不能为空');
    }
    if (!body) {
      throw new BadRequestException('通知内容不能为空');
    }
    if (title.length > 120) {
      throw new BadRequestException('通知标题最多 120 字');
    }
    if (body.length > 1000) {
      throw new BadRequestException('通知内容最多 1000 字');
    }
    if (linkUrl && !this.isSafeHttpUrl(linkUrl)) {
      throw new BadRequestException('通知链接必须是有效的 HTTP(S) 地址');
    }

    const recipients = await this.prisma.user.findMany({
      where: { status: 'active', deletedAt: null },
      select: { id: true },
    });

    const announcement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.systemAnnouncement.create({
        data: {
          title,
          body,
          linkUrl,
          publishedBy: this.parseId(admin.id),
          recipientCount: recipients.length,
        },
      });
      const payload = {
        title,
        body,
        linkUrl,
        announcementId: String(created.id),
      };
      for (let index = 0; index < recipients.length; index += 1000) {
        const batch = recipients.slice(index, index + 1000);
        if (batch.length > 0) {
          await tx.notification.createMany({
            data: batch.map((recipient) => ({
              recipientId: recipient.id,
              type: 'system',
              actorId: this.parseId(admin.id),
              payload,
            })),
          });
        }
      }
      await this.audit(
        admin,
        'announcement.publish',
        'announcement',
        created.id,
        ip,
        userAgent,
        {
          title,
          recipientCount: recipients.length,
        },
        tx,
      );
      return created;
    });

    return {
      ok: true,
      announcement: {
        id: String(announcement.id),
        title: announcement.title,
        body: announcement.body,
        linkUrl: announcement.linkUrl ?? undefined,
        audience: announcement.audience,
        recipientCount: announcement.recipientCount,
        publishedBy: admin.username,
        createdAt: announcement.createdAt.toISOString(),
      },
    };
  }

  async listSensitiveWords(
    opts: {
      q?: string;
      category?: AdminSensitiveCategory;
      action?: SensitiveAction;
      enabled?: boolean;
      page?: number;
      pageSize?: number;
    },
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    this.assertSuperadmin(admin, '只有超级管理员可以查看敏感词规则');
    const q = opts.q?.trim().slice(0, 100);
    const { page, pageSize } = this.normalizePagination(opts.page, opts.pageSize);
    const skip = (page - 1) * pageSize;

    const where = {
      ...(q
        ? {
            OR: [
              { word: { contains: q, mode: 'insensitive' as const } },
              { note: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(opts.category ? { category: this.toPrismaSensitiveCategory(opts.category) } : {}),
      ...(opts.action ? { action: opts.action } : {}),
      ...(opts.enabled === undefined ? {} : { enabled: opts.enabled }),
    };

    const [words, total] = await Promise.all([
      this.prisma.sensitiveWord.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
        include: { creator: { select: { username: true } } },
      }),
      this.prisma.sensitiveWord.count({ where }),
    ]);

    const items = words.map((word) => this.toSensitiveWordDto(word));

    await this.audit(
      admin,
      'sensitive-word.list.view',
      'sensitive-word',
      undefined,
      ip,
      userAgent,
      {
        query: q ?? null,
        category: opts.category ?? null,
        ruleAction: opts.action ?? null,
        enabled: opts.enabled ?? null,
        page,
        pageSize,
        resultCount: items.length,
        total,
        resultRuleIds: words.map((word) => String(word.id)).join(','),
      },
    );

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async createSensitiveWord(
    input: {
      word: string;
      category: AdminSensitiveCategory;
      action: SensitiveAction;
      note?: string;
    },
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    this.assertSuperadmin(admin);
    this.validateSensitiveCategory(input.category);
    this.validateSensitiveAction(input.action);
    if (input.note !== undefined && typeof input.note !== 'string') {
      throw new BadRequestException('规则备注格式无效');
    }
    if (input.note && input.note.trim().length > 500) {
      throw new BadRequestException('规则备注最多 500 字');
    }
    const word = this.normalizeSensitiveWord(input.word);
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.sensitiveWord.create({
        data: {
          word,
          category: this.toPrismaSensitiveCategory(input.category),
          action: input.action,
          note: input.note?.trim() || null,
          createdBy: this.parseId(admin.id),
        },
        include: { creator: { select: { username: true } } },
      });
      await this.audit(
        admin,
        'sensitive-word.create',
        'sensitive-word',
        row.id,
        ip,
        userAgent,
        {
          word,
          category: input.category,
          ruleAction: input.action,
        },
        tx,
      );
      return row;
    });
    await this.moderation.reloadCache();
    return this.toSensitiveWordDto(created);
  }

  async updateSensitiveWord(
    id: string,
    patch: Partial<{
      word: string;
      category: AdminSensitiveCategory;
      action: SensitiveAction;
      enabled: boolean;
      note: string;
    }>,
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    this.assertSuperadmin(admin);
    if (patch.category !== undefined) {
      this.validateSensitiveCategory(patch.category);
    }
    if (patch.action !== undefined) {
      this.validateSensitiveAction(patch.action);
    }
    if (patch.enabled !== undefined && typeof patch.enabled !== 'boolean') {
      throw new BadRequestException('规则启用状态无效');
    }
    if (patch.note !== undefined) {
      if (typeof patch.note !== 'string') {
        throw new BadRequestException('规则备注格式无效');
      }
      if (patch.note.trim().length > 500) {
        throw new BadRequestException('规则备注最多 500 字');
      }
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.sensitiveWord.update({
        where: { id: this.parseId(id) },
        data: {
          ...(patch.word === undefined ? {} : { word: this.normalizeSensitiveWord(patch.word) }),
          ...(patch.category === undefined
            ? {}
            : { category: this.toPrismaSensitiveCategory(patch.category) }),
          ...(patch.action === undefined ? {} : { action: patch.action }),
          ...(patch.enabled === undefined ? {} : { enabled: Boolean(patch.enabled) }),
          ...(patch.note === undefined ? {} : { note: patch.note.trim() || null }),
        },
        include: { creator: { select: { username: true } } },
      });
      await this.audit(
        admin,
        'sensitive-word.update',
        'sensitive-word',
        row.id,
        ip,
        userAgent,
        {
          word: row.word,
        },
        tx,
      );
      return row;
    });
    await this.moderation.reloadCache();
    return this.toSensitiveWordDto(updated);
  }

  async deleteSensitiveWord(
    id: string,
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    this.assertSuperadmin(admin);
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.sensitiveWord.delete({ where: { id: this.parseId(id) } });
      await this.audit(
        admin,
        'sensitive-word.delete',
        'sensitive-word',
        deleted.id,
        ip,
        userAgent,
        {
          word: deleted.word,
        },
        tx,
      );
    });
    await this.moderation.reloadCache();
    return { ok: true };
  }

  async reloadSensitiveWords(admin: AdminPrincipal, ip: string, userAgent?: string | string[]) {
    this.assertSuperadmin(admin);
    const count = await this.moderation.reloadCache();
    await this.audit(admin, 'sensitive-word.reload', 'sensitive-word', undefined, ip, userAgent, {
      count,
    });
    return { ok: true, count };
  }

  private async buildTrend(now: Date) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 29);
    const end = new Date(now);
    end.setHours(0, 0, 0, 0);

    return this.prisma.$queryRaw<TrendRow[]>`
      WITH days AS (
        SELECT generate_series(
          date_trunc('day', ${start}::timestamptz),
          date_trunc('day', ${end}::timestamptz),
          interval '1 day'
        ) AS day
      ), daily_events AS (
        SELECT date_trunc('day', created_at) AS day, 'users'::text AS metric, COUNT(*)::integer AS total
        FROM users WHERE created_at >= ${start} GROUP BY 1
        UNION ALL
        SELECT date_trunc('day', created_at), 'posts', COUNT(*)::integer
        FROM posts WHERE created_at >= ${start} GROUP BY 1
        UNION ALL
        SELECT date_trunc('day', created_at), 'comments', COUNT(*)::integer
        FROM comments WHERE created_at >= ${start} GROUP BY 1
        UNION ALL
        SELECT date_trunc('day', created_at), 'reports', COUNT(*)::integer
        FROM reports WHERE created_at >= ${start} GROUP BY 1
      )
      SELECT
        to_char(days.day, 'YYYY-MM-DD') AS date,
        COALESCE(SUM(daily_events.total) FILTER (WHERE daily_events.metric = 'users'), 0)::integer AS users,
        COALESCE(SUM(daily_events.total) FILTER (WHERE daily_events.metric = 'posts'), 0)::integer AS posts,
        COALESCE(SUM(daily_events.total) FILTER (WHERE daily_events.metric = 'comments'), 0)::integer AS comments,
        COALESCE(SUM(daily_events.total) FILTER (WHERE daily_events.metric = 'reports'), 0)::integer AS reports
      FROM days
      LEFT JOIN daily_events ON daily_events.day = days.day
      GROUP BY days.day
      ORDER BY days.day ASC
    `;
  }

  private async reportCounts(targetType: ReportTarget, targetIds: bigint[]) {
    if (targetIds.length === 0) {
      return new Map<bigint, number>();
    }
    const rows = await this.prisma.report.groupBy({
      by: ['targetId'],
      where: { targetType, targetId: { in: targetIds } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.targetId, row._count._all]));
  }

  private reportSnapshotFromEvidence(targetType: ReportTarget, evidence: Prisma.JsonValue) {
    const value = this.asMetadata(evidence);
    if (!value) {
      return undefined;
    }
    const messages = Array.isArray(value.messages)
      ? value.messages
          .map((message) => this.asMetadata(message as Prisma.JsonValue)?.content)
          .filter((content): content is string => typeof content === 'string')
      : [];
    const content =
      typeof value.content === 'string'
        ? value.content
        : messages.length
          ? messages.join('\n')
          : '';
    return {
      type: targetType,
      title: typeof value.title === 'string' ? value.title : undefined,
      preview: content.slice(0, 500) || '举报时证据已固化',
      createdAt: typeof value.createdAt === 'string' ? value.createdAt : undefined,
      evidencePreserved: true,
      messageCount: messages.length || undefined,
    };
  }

  private async buildReportSnapshot(
    targetType: ReportTarget,
    targetId: bigint,
    admin: AdminPrincipal,
  ) {
    const canReveal = false;
    if (targetType === 'post') {
      const post = await this.prisma.post.findUnique({
        where: { id: targetId },
        include: {
          board: { select: { slug: true } },
          author: { select: { id: true, username: true } },
        },
      });
      if (!post) {
        return { type: 'post', preview: '目标帖子已不存在' };
      }
      return {
        type: 'post',
        title: post.title,
        preview: post.contentMd.slice(0, 220),
        authorUsername: post.isAnonymous ? '浙小商' : post.author.username,
        isAnonymous: post.isAnonymous,
        realAuthorId: canReveal ? String(post.author.id) : undefined,
        realAuthorUsername: canReveal ? post.author.username : undefined,
        boardSlug: post.board.slug,
        createdAt: post.createdAt.toISOString(),
      };
    }

    if (targetType === 'comment') {
      const comment = await this.prisma.comment.findUnique({
        where: { id: targetId },
        include: {
          author: { select: { id: true, username: true } },
          post: {
            select: {
              title: true,
              board: { select: { slug: true } },
            },
          },
        },
      });
      if (!comment) {
        return { type: 'comment', preview: '目标评论已不存在' };
      }
      return {
        type: 'comment',
        title: comment.post.title,
        preview: comment.contentMd.slice(0, 220),
        authorUsername: comment.isAnonymous ? '浙小商' : comment.author.username,
        isAnonymous: comment.isAnonymous,
        realAuthorId: canReveal ? String(comment.author.id) : undefined,
        realAuthorUsername: canReveal ? comment.author.username : undefined,
        boardSlug: comment.post.board.slug,
        createdAt: comment.createdAt.toISOString(),
      };
    }

    if (targetType === 'conversation') {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: targetId },
        include: {
          messages: {
            where: { status: { not: 'deleted' } },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: { contentMd: true, createdAt: true },
          },
        },
      });
      return {
        type: 'conversation',
        preview: conversation
          ? conversation.messages
              .reverse()
              .map((message) => message.contentMd)
              .join('\n')
              .slice(0, 500)
          : '目标会话已不存在',
        messageCount: conversation?.messages.length,
        createdAt: conversation?.createdAt.toISOString(),
      };
    }
    if (targetType === 'direct_message') {
      const message = await this.prisma.directMessage.findUnique({ where: { id: targetId } });
      return {
        type: 'direct_message',
        preview: message?.contentMd.slice(0, 500) ?? '目标私信已不存在',
        createdAt: message?.createdAt.toISOString(),
      };
    }
    if (targetType === 'chatroom_message') {
      const message = await this.prisma.chatroomMessage.findUnique({ where: { id: targetId } });
      return {
        type: 'chatroom_message',
        preview: message?.content.slice(0, 500) ?? '目标聊天消息已不存在',
        createdAt: message?.createdAt.toISOString(),
      };
    }

    const user = await this.prisma.user.findUnique({ where: { id: targetId } });
    return {
      type: 'user',
      preview: user
        ? admin.role === 'superadmin'
          ? `${user.username} (${user.email})`
          : user.username
        : '目标用户已不存在',
      authorUsername: user?.username,
      createdAt: user?.createdAt.toISOString(),
    };
  }

  private async hideReportedTarget(
    tx: Prisma.TransactionClient,
    targetType: ReportTarget,
    targetId: bigint,
  ) {
    if (targetType === 'post') {
      await tx.post.update({ where: { id: targetId }, data: { status: 'hidden' } });
      return;
    }
    if (targetType === 'comment') {
      const comment = await tx.comment.findUniqueOrThrow({
        where: { id: targetId },
        select: { postId: true, status: true },
      });
      await tx.comment.update({ where: { id: targetId }, data: { status: 'hidden' } });
      if (comment.status === 'published') {
        await tx.post.updateMany({
          where: { id: comment.postId, commentCount: { gt: 0 } },
          data: { commentCount: { decrement: 1 } },
        });
      }
      return;
    }
    if (targetType === 'user') {
      const sanctionEndsAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      const currentUser = await tx.user.findUniqueOrThrow({
        where: { id: targetId },
        select: { status: true, suspendedUntil: true },
      });
      const suspendedUntil =
        currentUser.status === 'suspended' &&
        (!currentUser.suspendedUntil || currentUser.suspendedUntil > sanctionEndsAt)
          ? currentUser.suspendedUntil
          : sanctionEndsAt;
      await tx.user.update({
        where: { id: targetId },
        data: { status: 'suspended', suspendedUntil },
      });
      await tx.sanction.create({
        data: {
          userId: targetId,
          type: 'suspension',
          reason: '举报审核确认违规',
          endsAt: sanctionEndsAt,
        },
      });
      return;
    }
    if (targetType === 'conversation') {
      await tx.conversation.update({
        where: { id: targetId },
        data: { status: 'blocked' },
      });
      return;
    }
    if (targetType === 'direct_message') {
      await tx.directMessage.update({
        where: { id: targetId },
        data: { status: 'hidden', legalHold: true },
      });
      return;
    }
    const message = await tx.chatroomMessage.update({
      where: { id: targetId },
      data: { status: 'hidden', isFlagged: true, legalHold: true },
      select: { chatroomId: true },
    });
    await tx.chatroom.update({
      where: { id: message.chatroomId },
      data: { legalHold: true },
    });
  }

  private async releaseReportEvidenceHold(
    tx: Prisma.TransactionClient,
    report: {
      targetType: ReportTarget;
      targetId: bigint;
      evidenceSnapshot: Prisma.JsonValue;
    },
  ) {
    const remainingReportHolds = await tx.report.count({
      where: {
        targetType: report.targetType,
        targetId: report.targetId,
        legalHold: true,
      },
    });
    const surface =
      report.targetType === 'post' ||
      report.targetType === 'comment' ||
      report.targetType === 'direct_message' ||
      report.targetType === 'chatroom_message'
        ? report.targetType
        : null;
    const blockingCases = surface
      ? await tx.moderationCase.count({
          where: {
            surface,
            targetId: report.targetId,
            OR: [{ legalHold: true }, { status: { in: ['pending', 'in_review'] } }],
          },
        })
      : 0;
    if (remainingReportHolds > 0 || blockingCases > 0) {
      return;
    }

    if (report.targetType === 'post') {
      await tx.post.updateMany({
        where: { id: report.targetId, status: { in: ['published', 'pending_review'] } },
        data: { status: 'published', legalHold: false },
      });
      return;
    }
    if (report.targetType === 'comment') {
      const comment = await tx.comment.findUnique({
        where: { id: report.targetId },
        select: { postId: true },
      });
      if (!comment) {
        return;
      }
      const restored = await tx.comment.updateMany({
        where: { id: report.targetId, status: 'pending_review' },
        data: { status: 'published', legalHold: false },
      });
      if (restored.count === 1) {
        await tx.post.update({
          where: { id: comment.postId },
          data: { commentCount: { increment: 1 } },
        });
      } else {
        await tx.comment.updateMany({
          where: { id: report.targetId, status: 'published' },
          data: { legalHold: false },
        });
      }
      return;
    }
    if (report.targetType === 'direct_message') {
      await tx.directMessage.updateMany({
        where: { id: report.targetId, status: { in: ['published', 'pending_review'] } },
        data: { status: 'published', legalHold: false },
      });
      return;
    }
    if (report.targetType === 'conversation') {
      const evidence = this.asMetadata(report.evidenceSnapshot);
      const messages = Array.isArray(evidence?.messages) ? evidence.messages : [];
      const messageIds = messages
        .map((item) => this.asMetadata(item as Prisma.JsonValue)?.id)
        .filter((id): id is string => typeof id === 'string')
        .map((id) => this.parseId(id));
      if (messageIds.length > 0) {
        await tx.directMessage.updateMany({
          where: {
            id: { in: messageIds },
            status: { in: ['published', 'pending_review'] },
          },
          data: { legalHold: false },
        });
      }
      const previousStatus = evidence?.status;
      if (previousStatus === 'pending' || previousStatus === 'active') {
        await tx.conversation.updateMany({
          where: { id: report.targetId, status: 'blocked', blockedById: null },
          data: { status: previousStatus },
        });
      }
      return;
    }

    const message = await tx.chatroomMessage.findUnique({
      where: { id: report.targetId },
      select: { chatroomId: true, status: true },
    });
    if (!message) {
      return;
    }
    if (message.status === 'published' || message.status === 'pending_review') {
      await tx.chatroomMessage.update({
        where: { id: report.targetId },
        data: { status: 'published', isFlagged: false, legalHold: false },
      });
    }
    const otherHeldMessages = await tx.chatroomMessage.count({
      where: { chatroomId: message.chatroomId, legalHold: true },
    });
    if (otherHeldMessages === 0) {
      await tx.chatroom.update({
        where: { id: message.chatroomId },
        data: { legalHold: false },
      });
    }
  }

  private async applyModerationDecision(
    tx: Prisma.TransactionClient,
    surface: 'post' | 'comment' | 'direct_message' | 'chatroom_message' | 'upload',
    targetId: bigint,
    decision: 'allow' | 'warn' | 'hide' | 'delete' | 'suspend' | 'ban',
  ) {
    const status: ContentStatus =
      decision === 'allow' || decision === 'warn'
        ? 'published'
        : decision === 'delete'
          ? 'deleted'
          : 'hidden';
    if (surface === 'post') {
      await tx.post.update({
        where: { id: targetId },
        data: { status, deletedAt: status === 'deleted' ? new Date() : null },
      });
      return;
    }
    if (surface === 'comment') {
      const comment = await tx.comment.findUniqueOrThrow({
        where: { id: targetId },
        select: { postId: true, status: true },
      });
      await tx.comment.update({
        where: { id: targetId },
        data: { status, deletedAt: status === 'deleted' ? new Date() : null },
      });
      const delta =
        status === 'published' && comment.status !== 'published'
          ? 1
          : status !== 'published' && comment.status === 'published'
            ? -1
            : 0;
      if (delta) {
        await tx.post.update({
          where: { id: comment.postId },
          data: { commentCount: { increment: delta } },
        });
      }
      return;
    }
    if (surface === 'direct_message') {
      const message = await tx.directMessage.findUniqueOrThrow({
        where: { id: targetId },
        select: {
          status: true,
          senderId: true,
          conversationId: true,
          createdAt: true,
          conversation: { select: { status: true, initiatorId: true } },
        },
      });
      await tx.directMessage.update({ where: { id: targetId }, data: { status } });
      if (status === 'published' && message.status !== 'published') {
        await tx.conversation.updateMany({
          where: { id: message.conversationId, lastMessageAt: { lt: message.createdAt } },
          data: { lastMessageAt: message.createdAt },
        });
        if (
          message.conversation.status === 'pending' &&
          message.conversation.initiatorId !== message.senderId
        ) {
          await tx.conversation.updateMany({
            where: { id: message.conversationId, status: 'pending' },
            data: { status: 'active' },
          });
        }
      }
      return;
    }
    if (surface === 'chatroom_message') {
      await tx.chatroomMessage.update({
        where: { id: targetId },
        data: { status, isFlagged: status !== 'published' },
      });
    }
  }

  private async releaseModerationCaseEvidenceHold(
    tx: Prisma.TransactionClient,
    surface: 'post' | 'comment' | 'direct_message' | 'chatroom_message' | 'upload',
    targetId: bigint,
    currentCaseId: bigint,
  ) {
    if (surface === 'upload') {
      return;
    }
    const reportTarget = surface as Exclude<ReportTarget, 'user' | 'conversation'>;
    const [otherCaseHolds, reportHolds] = await Promise.all([
      tx.moderationCase.count({
        where: { id: { not: currentCaseId }, surface, targetId, legalHold: true },
      }),
      tx.report.count({
        where: { targetType: reportTarget, targetId, legalHold: true },
      }),
    ]);
    if (otherCaseHolds > 0 || reportHolds > 0) {
      return;
    }

    if (surface === 'post') {
      await tx.post.update({ where: { id: targetId }, data: { legalHold: false } });
      return;
    }
    if (surface === 'comment') {
      await tx.comment.update({ where: { id: targetId }, data: { legalHold: false } });
      return;
    }
    if (surface === 'direct_message') {
      await tx.directMessage.update({ where: { id: targetId }, data: { legalHold: false } });
      return;
    }
    const message = await tx.chatroomMessage.update({
      where: { id: targetId },
      data: { legalHold: false },
      select: { chatroomId: true },
    });
    const otherHeldMessages = await tx.chatroomMessage.count({
      where: { chatroomId: message.chatroomId, legalHold: true },
    });
    if (otherHeldMessages === 0) {
      await tx.chatroom.update({
        where: { id: message.chatroomId },
        data: { legalHold: false },
      });
    }
  }

  private postActionData(
    action: 'hide' | 'restore' | 'pin' | 'unpin' | 'lock' | 'unlock' | 'delete',
  ): Prisma.PostUpdateInput {
    switch (action) {
      case 'hide':
        return { status: 'hidden' };
      case 'restore':
        return { status: 'published', deletedAt: null };
      case 'pin':
        return { isPinned: true };
      case 'unpin':
        return { isPinned: false };
      case 'lock':
        return { isLocked: true };
      case 'unlock':
        return { isLocked: false };
      case 'delete':
        return { status: 'deleted', deletedAt: new Date(), isPinned: false };
    }
  }

  private normalizeSensitiveWord(word: string) {
    if (typeof word !== 'string') {
      throw new BadRequestException('敏感词格式无效');
    }
    const trimmed = word.trim().toLowerCase();
    if (!trimmed) {
      throw new BadRequestException('敏感词不能为空');
    }
    if (trimmed.length > 80) {
      throw new BadRequestException('敏感词最多 80 个字符');
    }
    return trimmed;
  }

  private validateSensitiveCategory(category: AdminSensitiveCategory) {
    if (!['illegal', 'porn', 'ad', 'harassment', 'other'].includes(category)) {
      throw new BadRequestException('敏感词分类无效');
    }
  }

  private validateSensitiveAction(action: SensitiveAction) {
    if (!['block', 'review', 'mask'].includes(action)) {
      throw new BadRequestException('敏感词处理方式无效');
    }
  }

  private toPrismaSensitiveCategory(category: AdminSensitiveCategory): PrismaSensitiveCategory {
    if (category === 'illegal') {
      return 'political';
    }
    if (category === 'harassment') {
      return 'violence';
    }
    return category;
  }

  private fromPrismaSensitiveCategory(category: PrismaSensitiveCategory): AdminSensitiveCategory {
    if (category === 'political') {
      return 'illegal';
    }
    if (category === 'violence') {
      return 'harassment';
    }
    return category;
  }

  private toSensitiveWordDto(word: {
    id: bigint;
    word: string;
    category: PrismaSensitiveCategory;
    action: SensitiveAction;
    hitCount: number;
    enabled: boolean;
    note: string | null;
    createdAt: Date;
    updatedAt: Date;
    creator?: { username: string } | null;
  }) {
    return {
      id: String(word.id),
      word: word.word,
      category: this.fromPrismaSensitiveCategory(word.category),
      action: word.action,
      hitCount: word.hitCount,
      enabled: word.enabled,
      createdBy: word.creator?.username ?? '系统',
      createdAt: word.createdAt.toISOString(),
      updatedAt: word.updatedAt.toISOString(),
      note: word.note ?? undefined,
    };
  }

  private async getUserOrThrow(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id: this.parseId(id) } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    return user;
  }

  private async revokeUserSessions(userId: bigint) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.client.scan(
        cursor,
        'MATCH',
        'admin-session:*',
        'COUNT',
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        const values = await this.redis.client.mget(keys);
        const ownedKeys = keys.filter((_, index) => values[index] === String(userId));
        if (ownedKeys.length > 0) {
          await this.redis.client.del(...ownedKeys);
        }
      }
    } while (cursor !== '0');
  }

  private async revokeAppealSessions(userId: bigint) {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.client.scan(
        cursor,
        'MATCH',
        'appeal-session:*',
        'COUNT',
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        const values = await this.redis.client.mget(keys);
        const ownedKeys = keys.filter((_, index) => values[index] === String(userId));
        if (ownedKeys.length > 0) {
          await this.redis.client.del(...ownedKeys);
        }
      }
    } while (cursor !== '0');
  }

  private async audit(
    admin: AdminPrincipal,
    action: string,
    targetType: string,
    targetId: bigint | undefined,
    ip: string,
    userAgent: string | string[] | undefined,
    metadata: AuditMetadata = {},
    client: Pick<Prisma.TransactionClient, 'auditLog'> = this.prisma,
  ) {
    await client.auditLog.create({
      data: {
        actorId: this.parseId(admin.id),
        action,
        targetType,
        targetId,
        ip,
        userAgent: (Array.isArray(userAgent) ? userAgent.join(', ') : userAgent)?.slice(0, 512),
        metadata: this.cleanMetadata({
          ...metadata,
          actorId: admin.id,
          actorUsername: admin.username,
          actorRole: admin.role,
        }),
      },
    });
  }

  private assertSuperadmin(admin: AdminPrincipal, message = '只有超级管理员可以执行此操作'): void {
    if (admin.role !== 'superadmin') {
      throw new ForbiddenException(message);
    }
  }

  private validateSanctionReason(value: string) {
    const reason = value?.trim();
    if (!reason || reason.length < 5 || reason.length > 1000) {
      throw new BadRequestException('处罚或解除限制必须填写 5 到 1000 字的具体依据');
    }
    return reason;
  }

  private assertCanManageUser(admin: AdminPrincipal, target: { id: bigint; role: UserRole }): void {
    if (String(target.id) === admin.id) {
      throw new ForbiddenException('不能对当前登录账号执行此操作');
    }
    const actorRank = this.roleRank(admin.role);
    const targetRank = this.roleRank(target.role);
    if (target.role === 'superadmin' || actorRank <= targetRank) {
      throw new ForbiddenException('不能对同级或更高权限账号执行此操作');
    }
  }

  private roleRank(role: UserRole): number {
    return { user: 0, moderator: 1, admin: 2, superadmin: 3 }[role];
  }

  private normalizePagination(
    requestedPage: number | undefined,
    requestedPageSize: number | undefined,
  ): { page: number; pageSize: number } {
    const page =
      typeof requestedPage === 'number' && Number.isInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1;
    const pageSize =
      typeof requestedPageSize === 'number' &&
      Number.isInteger(requestedPageSize) &&
      requestedPageSize > 0
        ? Math.min(requestedPageSize, 100)
        : 20;
    return { page, pageSize };
  }

  private isSafeHttpUrl(value: string): boolean {
    if (value.length > 2048) {
      return false;
    }
    try {
      const url = new URL(value);
      return (
        (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
      );
    } catch {
      return false;
    }
  }

  private cleanMetadata(metadata: AuditMetadata): Record<string, string | number | boolean | null> {
    return Object.fromEntries(
      Object.entries(metadata).filter(
        (entry): entry is [string, string | number | boolean | null] => {
          return entry[1] !== undefined;
        },
      ),
    );
  }

  private parseId(id: string): bigint {
    try {
      return BigInt(id);
    } catch {
      throw new BadRequestException('无效 ID');
    }
  }

  private effectiveUserStatus(status: UserStatus, suspendedUntil: Date | null): UserStatus {
    if (status === 'suspended' && suspendedUntil && suspendedUntil <= new Date()) {
      return 'active';
    }
    return status;
  }

  private asMetadata(value: Prisma.JsonValue): Record<string, unknown> | undefined {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return undefined;
  }
}

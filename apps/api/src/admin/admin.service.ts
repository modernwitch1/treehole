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

type AuditMetadata = Record<string, string | number | boolean | null | undefined>;
type UserStatus = 'active' | 'suspended' | 'banned';
type UserRole = 'user' | 'moderator' | 'admin';
type ContentStatus = 'published' | 'pending_review' | 'hidden' | 'deleted';
type ReportStatus = 'open' | 'resolved' | 'rejected';
type AdminSensitiveCategory = 'illegal' | 'porn' | 'ad' | 'harassment' | 'other';
type PrismaSensitiveCategory = 'political' | 'porn' | 'violence' | 'ad' | 'other';
type SensitiveAction = 'block' | 'review' | 'mask';
type ReportTarget = 'user' | 'post' | 'comment';

interface TrendRow {
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
      trend,
    };
  }

  async listUsers(opts: {
    q?: string;
    status?: UserStatus;
    role?: UserRole;
    page?: number;
    pageSize?: number;
  }, admin: AdminPrincipal) {
    this.assertAdmin(admin, '只有管理员可以查看用户隐私信息');
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

    const reportCounts = await this.reportCounts('user', users.map((user) => user.id));
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

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async suspendUser(id: string, admin: AdminPrincipal, ip: string, userAgent?: string | string[]) {
    const user = await this.getUserOrThrow(id);
    this.assertCanManageUser(admin, user);
    const suspendedUntil = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { status: 'suspended', suspendedUntil },
    });
    await this.audit(admin, 'user.suspend', 'user', user.id, ip, userAgent, {
      username: user.username,
      days: 7,
      suspendedUntil: suspendedUntil.toISOString(),
    });
    return { ok: true };
  }

  async banUser(id: string, admin: AdminPrincipal, ip: string, userAgent?: string | string[]) {
    const user = await this.getUserOrThrow(id);
    this.assertCanManageUser(admin, user);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { status: 'banned', suspendedUntil: null },
    });
    await this.prisma.bannedEmail.upsert({
      where: { email: user.email },
      update: { reason: '管理员封禁账号' },
      create: { email: user.email, reason: '管理员封禁账号' },
    });
    await this.audit(admin, 'user.ban', 'user', user.id, ip, userAgent, {
      username: user.username,
      email: user.email,
    });
    return { ok: true };
  }

  async unbanUser(id: string, admin: AdminPrincipal, ip: string, userAgent?: string | string[]) {
    const user = await this.getUserOrThrow(id);
    this.assertCanManageUser(admin, user);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { status: 'active', suspendedUntil: null },
    });
    await this.prisma.bannedEmail.deleteMany({ where: { email: user.email } });
    await this.audit(admin, 'user.unban', 'user', user.id, ip, userAgent, {
      username: user.username,
      email: user.email,
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
    this.assertAdmin(admin, '只有管理员可以变更角色');
    if (role !== 'moderator' && role !== 'user') {
      throw new BadRequestException('无效的用户角色');
    }
    const user = await this.getUserOrThrow(id);
    if (String(user.id) === admin.id || user.role === 'admin') {
      throw new ForbiddenException('不能变更当前管理员或其他管理员的角色');
    }
    const oldRole = user.role;
    await this.prisma.user.update({ where: { id: user.id }, data: { role } });
    await this.audit(
      admin,
      role === 'moderator' ? 'user.promote' : 'user.demote',
      'user',
      user.id,
      ip,
      userAgent,
      { username: user.username, from: oldRole, to: role },
    );
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
        orderBy: { createdAt: 'desc' },
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
        reporter: { id: String(r.reporter.id), username: r.reporter.username },
        targetType: r.targetType,
        targetId: String(r.targetId),
        targetSnapshot: await this.buildReportSnapshot(r.targetType, r.targetId, admin),
        category: r.category,
        reason: r.reason ?? undefined,
        status: r.status,
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

    if (action === 'hide') {
      if (report.targetType === 'user') {
        const target = await this.getUserOrThrow(String(report.targetId));
        this.assertCanManageUser(admin, target);
      }
      await this.hideReportedTarget(report.targetType, report.targetId);
      await this.prisma.report.update({
        where: { id: report.id },
        data: {
          status: 'resolved',
          handledAt: new Date(),
          resolutionNote: note ?? '已隐藏违规内容',
        },
      });
    } else {
      await this.prisma.report.update({
        where: { id: report.id },
        data: {
          status: action === 'resolve' ? 'resolved' : 'rejected',
          handledAt: new Date(),
          resolutionNote: note,
        },
      });
    }

    await this.audit(admin, `report.${action}`, 'report', report.id, ip, userAgent, {
      note,
      targetType: report.targetType,
      targetId: String(report.targetId),
    });
    return { ok: true };
  }

  async listPosts(opts: { page?: number; pageSize?: number }, _admin: AdminPrincipal) {
    const { page, pageSize } = this.normalizePagination(opts.page, opts.pageSize);
    const skip = (page - 1) * pageSize;

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          board: { select: { slug: true, name: true } },
          author: { select: { id: true, username: true } },
        },
      }),
      this.prisma.post.count(),
    ]);

    const reportCounts = await this.reportCounts('post', posts.map((post) => post.id));
    const items = posts.map((p) => ({
        id: String(p.id),
        boardSlug: p.board.slug,
        boardName: p.board.name,
        title: p.title,
        excerpt: p.contentMd.slice(0, 200),
        authorUsername: p.isAnonymous ? '匿名' : p.author.username,
        authorId: '',
        isAnonymous: p.isAnonymous,
        status: p.status,
        upvotes: p.upvotes,
        downvotes: p.downvotes,
        score: p.score,
        commentCount: p.commentCount,
        reportCount: reportCounts.get(p.id) ?? 0,
        isPinned: p.isPinned,
        isLocked: p.isLocked,
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

    const data = this.postActionData(action);
    await this.prisma.post.update({ where: { id: post.id }, data });
    await this.audit(admin, `post.${action}`, 'post', post.id, ip, userAgent, {
      title: post.title,
    });
    return { ok: true };
  }

  async revealPostAuthor(
    id: string,
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    this.assertAdmin(admin);
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

  async listComments(opts: { page?: number; pageSize?: number }, _admin: AdminPrincipal) {
    const { page, pageSize } = this.normalizePagination(opts.page, opts.pageSize);
    const skip = (page - 1) * pageSize;

    const [comments, total] = await Promise.all([
      this.prisma.comment.findMany({
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
      this.prisma.comment.count(),
    ]);

    const reportCounts = await this.reportCounts('comment', comments.map((comment) => comment.id));
    const items = comments.map((c) => ({
        id: String(c.id),
        postId: String(c.postId),
        postTitle: c.post.title,
        boardSlug: c.post.board.slug,
        excerpt: c.contentMd.slice(0, 200),
        authorUsername: c.isAnonymous ? '匿名' : c.author.username,
        authorId: '',
        isAnonymous: c.isAnonymous,
        status: c.status,
        score: c.score,
        reportCount: reportCounts.get(c.id) ?? 0,
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

    const status: ContentStatus =
      action === 'restore' ? 'published' : action === 'delete' ? 'deleted' : 'hidden';
    await this.prisma.comment.update({
      where: { id: comment.id },
      data: {
        status,
        deletedAt: action === 'delete' ? new Date() : action === 'restore' ? null : undefined,
      },
    });
    await this.audit(admin, `comment.${action}`, 'comment', comment.id, ip, userAgent, {
      excerpt: comment.contentMd.slice(0, 80),
    });
    return { ok: true };
  }

  async revealCommentAuthor(
    id: string,
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    this.assertAdmin(admin);
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

  async listAuditLogs(opts: { page?: number; pageSize?: number }, admin: AdminPrincipal) {
    this.assertAdmin(admin, '只有管理员可以查看审计日志');
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
    this.assertAdmin(admin);
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
      return created;
    });

    await this.audit(
      admin,
      'announcement.publish',
      'announcement',
      announcement.id,
      ip,
      userAgent,
      {
        title,
        recipientCount: recipients.length,
      },
    );

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

  async listSensitiveWords(opts: {
    q?: string;
    category?: AdminSensitiveCategory;
    action?: SensitiveAction;
    enabled?: boolean;
    page?: number;
    pageSize?: number;
  }, admin: AdminPrincipal) {
    this.assertAdmin(admin, '只有管理员可以查看敏感词规则');
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
    this.assertAdmin(admin);
    const word = this.normalizeSensitiveWord(input.word);
    const created = await this.prisma.sensitiveWord.create({
      data: {
        word,
        category: this.toPrismaSensitiveCategory(input.category),
        action: input.action,
        note: input.note?.trim() || null,
        createdBy: this.parseId(admin.id),
      },
      include: { creator: { select: { username: true } } },
    });
    await this.audit(admin, 'sensitive-word.create', 'sensitive-word', created.id, ip, userAgent, {
      word,
      category: input.category,
      ruleAction: input.action,
    });
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
    this.assertAdmin(admin);
    const updated = await this.prisma.sensitiveWord.update({
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
    await this.audit(admin, 'sensitive-word.update', 'sensitive-word', updated.id, ip, userAgent, {
      word: updated.word,
    });
    return this.toSensitiveWordDto(updated);
  }

  async deleteSensitiveWord(
    id: string,
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    this.assertAdmin(admin);
    const deleted = await this.prisma.sensitiveWord.delete({ where: { id: this.parseId(id) } });
    await this.audit(admin, 'sensitive-word.delete', 'sensitive-word', deleted.id, ip, userAgent, {
      word: deleted.word,
    });
    return { ok: true };
  }

  async reloadSensitiveWords(admin: AdminPrincipal, ip: string, userAgent?: string | string[]) {
    this.assertAdmin(admin);
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
    if (targetIds.length === 0) return new Map<bigint, number>();
    const rows = await this.prisma.report.groupBy({
      by: ['targetId'],
      where: { targetType, targetId: { in: targetIds } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.targetId, row._count._all]));
  }

  private async buildReportSnapshot(targetType: string, targetId: bigint, admin: AdminPrincipal) {
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
        authorUsername: post.isAnonymous ? '匿名' : post.author.username,
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
        authorUsername: comment.isAnonymous ? '匿名' : comment.author.username,
        isAnonymous: comment.isAnonymous,
        realAuthorId: canReveal ? String(comment.author.id) : undefined,
        realAuthorUsername: canReveal ? comment.author.username : undefined,
        boardSlug: comment.post.board.slug,
        createdAt: comment.createdAt.toISOString(),
      };
    }

    const user = await this.prisma.user.findUnique({ where: { id: targetId } });
    return {
      type: 'user',
      preview: user
        ? admin.role === 'admin'
          ? `${user.username} (${user.email})`
          : user.username
        : '目标用户已不存在',
      authorUsername: user?.username,
      createdAt: user?.createdAt.toISOString(),
    };
  }

  private async hideReportedTarget(targetType: string, targetId: bigint) {
    if (targetType === 'post') {
      await this.prisma.post.update({ where: { id: targetId }, data: { status: 'hidden' } });
      return;
    }
    if (targetType === 'comment') {
      await this.prisma.comment.update({ where: { id: targetId }, data: { status: 'hidden' } });
      return;
    }
    if (targetType === 'user') {
      await this.prisma.user.update({
        where: { id: targetId },
        data: { status: 'suspended', suspendedUntil: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
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
    const trimmed = word.trim().toLowerCase();
    if (!trimmed) {
      throw new BadRequestException('敏感词不能为空');
    }
    if (trimmed.length > 80) {
      throw new BadRequestException('敏感词最多 80 个字符');
    }
    return trimmed;
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

  private async audit(
    admin: AdminPrincipal,
    action: string,
    targetType: string,
    targetId: bigint | undefined,
    ip: string,
    userAgent: string | string[] | undefined,
    metadata: AuditMetadata = {},
  ) {
    await this.prisma.auditLog.create({
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

  private assertAdmin(admin: AdminPrincipal, message = '只有管理员可以查看真实身份') {
    if (admin.role !== 'admin') {
      throw new ForbiddenException(message);
    }
  }

  private assertCanManageUser(
    admin: AdminPrincipal,
    target: { id: bigint; role: UserRole },
  ): void {
    if (String(target.id) === admin.id) {
      throw new ForbiddenException('不能对当前登录账号执行此操作');
    }
    if (target.role === 'admin' || (target.role === 'moderator' && admin.role !== 'admin')) {
      throw new ForbiddenException('不能对同级或更高权限账号执行此操作');
    }
  }

  private normalizePagination(
    requestedPage: number | undefined,
    requestedPageSize: number | undefined,
  ): { page: number; pageSize: number } {
    const page = Number.isInteger(requestedPage) && (requestedPage ?? 0) > 0 ? requestedPage! : 1;
    const pageSize =
      Number.isInteger(requestedPageSize) && (requestedPageSize ?? 0) > 0
        ? Math.min(requestedPageSize!, 100)
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
        (url.protocol === 'https:' || url.protocol === 'http:') &&
        !url.username &&
        !url.password
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

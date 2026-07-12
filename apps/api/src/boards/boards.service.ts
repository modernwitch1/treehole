import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import type { BoardStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { RateLimitService } from '../common/security/rate-limit.service';
import { ModerationService } from '../common/moderation.service';
import { COMMUNITY_RULES_VERSION } from '../common/community-safety.constants';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
    private readonly moderation: ModerationService,
  ) {}

  async listBoards(opts?: { status?: BoardStatus }) {
    const boards = await this.prisma.board.findMany({
      where: {
        status: opts?.status ?? 'active',
        isArchived: false,
      },
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: { select: { posts: true } },
      },
    });

    return boards.map((board) => ({
      id: String(board.id),
      slug: board.slug,
      name: board.name,
      description: board.description,
      icon: board.icon,
      color: board.color,
      allowsAnonymous: board.allowsAnonymous,
      postCount: board._count.posts,
      subscriberCount: board.subscriberCount,
      sortOrder: board.sortOrder,
    }));
  }

  async getBoard(slug: string) {
    const board = await this.prisma.board.findUnique({
      where: { slug },
      include: {
        _count: { select: { posts: true } },
      },
    });

    if (!board || board.status !== 'active') {
      throw new NotFoundException('板块不存在');
    }

    return {
      id: String(board.id),
      slug: board.slug,
      name: board.name,
      description: board.description,
      rules: board.rules,
      icon: board.icon,
      color: board.color,
      allowsAnonymous: board.allowsAnonymous,
      postCount: board._count.posts,
      subscriberCount: board.subscriberCount,
    };
  }

  async applyForBoard(data: {
    name: string;
    description: string;
    reason: string;
    applicantId: bigint;
    rulesAcknowledged: boolean;
    ip?: string;
    userAgent?: string;
  }) {
    const { name, description, reason, applicantId } = data;

    await this.rateLimit.consume('board-application-user', String(applicantId), 3, 24 * 3600);
    if (!data.rulesAcknowledged) {
      throw new BadRequestException('请先确认板块申请内容遵守社区规则');
    }
    const applicant = await this.prisma.user.findUnique({
      where: { id: applicantId },
      select: { status: true, suspendedUntil: true },
    });
    if (
      !applicant ||
      applicant.status === 'banned' ||
      (applicant.status === 'suspended' &&
        (!applicant.suspendedUntil || applicant.suspendedUntil > new Date()))
    ) {
      throw new ForbiddenException('当前账号不能申请板块');
    }

    if (typeof name !== 'string' || !name.trim()) {
      throw new BadRequestException('板块名称不能为空');
    }
    if (name.length > 50) {
      throw new BadRequestException('板块名称最多 50 字');
    }
    if (typeof description !== 'string' || !description.trim()) {
      throw new BadRequestException('板块简介不能为空');
    }
    if (description.length > 200) {
      throw new BadRequestException('板块简介最多 200 字');
    }
    if (typeof reason !== 'string' || !reason.trim()) {
      throw new BadRequestException('申请理由不能为空');
    }
    if (reason.length > 1000) {
      throw new BadRequestException('申请理由最多 1000 字');
    }

    const moderationContext = {
      surface: 'post' as const,
      authorId: applicantId,
      ip: data.ip,
      userAgent: data.userAgent,
    };
    const [moderatedName, moderatedDescription, moderatedReason] = await Promise.all([
      this.moderation.moderateOrThrow(name.trim(), moderationContext),
      this.moderation.moderateOrThrow(description.trim(), moderationContext),
      this.moderation.moderateOrThrow(reason.trim(), moderationContext),
    ]);
    if (
      [moderatedName, moderatedDescription, moderatedReason].some(
        (result) => result.status === 'pending_review',
      )
    ) {
      throw new BadRequestException('申请内容需要人工审核，请修改后重新提交');
    }

    // 生成 slug
    const slug = this.generateSlug(name);

    // 检查 slug 是否已存在
    const existing = await this.prisma.board.findUnique({
      where: { slug },
    });
    if (existing) {
      throw new BadRequestException('该板块名称已被占用');
    }

    // 检查用户是否有待审批的申请
    const pendingApplication = await this.prisma.board.findFirst({
      where: {
        applicantId,
        status: 'pending',
      },
    });
    if (pendingApplication) {
      throw new BadRequestException('您已有待审批的申请，请等待审核');
    }

    const board = await this.prisma.$transaction(async (tx) => {
      const created = await tx.board.create({
        data: {
          slug,
          name: moderatedName.content,
          description: moderatedDescription.content,
          applyReason: moderatedReason.content,
          applicantId,
          status: 'pending',
          appliedAt: new Date(),
        },
      });
      await tx.policyAcceptance.create({
        data: {
          userId: applicantId,
          policyVersion: COMMUNITY_RULES_VERSION,
          source: 'publish',
          ip: data.ip && data.ip !== 'unknown' ? data.ip : null,
          userAgent: data.userAgent?.slice(0, 512),
        },
      });
      return created;
    });

    return {
      ok: true,
      board: {
        id: String(board.id),
        slug: board.slug,
        name: board.name,
        status: board.status,
      },
    };
  }

  async approveBoard(
    boardId: string,
    admin: AdminPrincipal,
    ip: string,
    userAgent?: string | string[],
  ) {
    this.assertSuperadmin(admin);
    const id = this.parseId(boardId);
    const board = await this.prisma.board.findUnique({ where: { id } });

    if (!board) {
      throw new NotFoundException('申请不存在');
    }
    if (board.status !== 'pending') {
      throw new BadRequestException('该申请已处理');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.board.updateMany({
        where: { id, status: 'pending' },
        data: {
          status: 'active',
          reviewedBy: BigInt(admin.id),
          reviewedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('该申请已处理');
      }
      const result = await tx.board.findUniqueOrThrow({ where: { id } });
      await this.auditBoardAction(tx, admin, 'board.approve', result.id, ip, userAgent, {
        name: result.name,
      });
      return result;
    });

    return {
      ok: true,
      board: {
        id: String(updated.id),
        slug: updated.slug,
        name: updated.name,
        status: updated.status,
      },
    };
  }

  async rejectBoard(
    boardId: string,
    admin: AdminPrincipal,
    reason: string | undefined,
    ip: string,
    userAgent?: string | string[],
  ) {
    this.assertSuperadmin(admin);
    const id = this.parseId(boardId);
    if (reason && reason.trim().length > 500) {
      throw new BadRequestException('驳回理由最多 500 字');
    }
    const board = await this.prisma.board.findUnique({ where: { id } });

    if (!board) {
      throw new NotFoundException('申请不存在');
    }
    if (board.status !== 'pending') {
      throw new BadRequestException('该申请已处理');
    }

    const rejectReason = reason?.trim() || '不符合板块开设要求';
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.board.updateMany({
        where: { id, status: 'pending' },
        data: {
          status: 'rejected',
          rejectReason,
          reviewedBy: BigInt(admin.id),
          reviewedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('该申请已处理');
      }
      const result = await tx.board.findUniqueOrThrow({ where: { id } });
      await this.auditBoardAction(tx, admin, 'board.reject', result.id, ip, userAgent, {
        name: result.name,
        reason: rejectReason,
      });
      return result;
    });

    return {
      ok: true,
      board: {
        id: String(updated.id),
        slug: updated.slug,
        name: updated.name,
        status: updated.status,
      },
    };
  }

  async listPendingApplications(admin: AdminPrincipal, ip: string, userAgent?: string | string[]) {
    this.assertSuperadmin(admin);
    const boards = await this.prisma.board.findMany({
      where: { status: 'pending' },
      orderBy: { appliedAt: 'asc' },
      include: {
        applicant: {
          select: { id: true, username: true, email: true },
        },
      },
    });

    if (boards.length > 0) {
      await this.auditBoardAction(
        this.prisma,
        admin,
        'board.applications.view',
        undefined,
        ip,
        userAgent,
        { count: boards.length },
      );
    }
    return boards.map((board) => ({
      id: String(board.id),
      name: board.name,
      description: board.description,
      applyReason: board.applyReason,
      applicant: board.applicant
        ? {
            id: String(board.applicant.id),
            username: board.applicant.username,
          }
        : null,
      appliedAt: board.appliedAt?.toISOString(),
    }));
  }

  private generateSlug(_name: string): string {
    // 简单的 slug 生成：使用时间戳 + 随机数
    const timestamp = Date.now().toString(36);
    const random = randomBytes(3).toString('hex');
    return `board-${timestamp}-${random}`;
  }

  private parseId(value: string): bigint {
    try {
      return BigInt(value);
    } catch {
      throw new BadRequestException('无效 ID');
    }
  }

  private assertSuperadmin(admin: AdminPrincipal): void {
    if (admin.role !== 'superadmin') {
      throw new ForbiddenException('只有超级管理员可以管理板块申请');
    }
  }

  private async auditBoardAction(
    client: Pick<Prisma.TransactionClient, 'auditLog'>,
    admin: AdminPrincipal,
    action: string,
    targetId: bigint | undefined,
    ip: string,
    userAgent: string | string[] | undefined,
    metadata: Record<string, string | number>,
  ): Promise<void> {
    await client.auditLog.create({
      data: {
        actorId: BigInt(admin.id),
        action,
        targetType: 'board',
        targetId,
        ip: ip && ip !== 'unknown' ? ip : null,
        userAgent: (Array.isArray(userAgent) ? userAgent.join(', ') : userAgent)?.slice(0, 512),
        metadata: {
          ...metadata,
          actorId: admin.id,
          actorUsername: admin.username,
          actorRole: admin.role,
        },
      },
    });
  }
}

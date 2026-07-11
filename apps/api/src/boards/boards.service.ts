import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import type { BoardStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { RateLimitService } from '../common/security/rate-limit.service';

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
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
  }) {
    const { name, description, reason, applicantId } = data;

    await this.rateLimit.consume('board-application-user', String(applicantId), 3, 24 * 3600);
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

    const board = await this.prisma.board.create({
      data: {
        slug,
        name: name.trim(),
        description: description.trim(),
        applyReason: reason.trim(),
        applicantId,
        status: 'pending',
        appliedAt: new Date(),
      },
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

  async approveBoard(boardId: string, reviewerId: bigint) {
    const id = this.parseId(boardId);
    const board = await this.prisma.board.findUnique({ where: { id } });

    if (!board) {
      throw new NotFoundException('申请不存在');
    }
    if (board.status !== 'pending') {
      throw new BadRequestException('该申请已处理');
    }

    const updated = await this.prisma.board.update({
      where: { id },
      data: {
        status: 'active',
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
      },
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

  async rejectBoard(boardId: string, reviewerId: bigint, reason?: string) {
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

    const updated = await this.prisma.board.update({
      where: { id },
      data: {
        status: 'rejected',
        rejectReason: reason?.trim() || '不符合板块开设要求',
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
      },
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

  async listPendingApplications() {
    const boards = await this.prisma.board.findMany({
      where: { status: 'pending' },
      orderBy: { appliedAt: 'asc' },
      include: {
        applicant: {
          select: { id: true, username: true, email: true },
        },
      },
    });

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

  private generateSlug(name: string): string {
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
}

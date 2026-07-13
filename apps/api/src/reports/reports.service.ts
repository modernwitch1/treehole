import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.module';
import { RateLimitService } from '../common/security/rate-limit.service';

export type ReportTarget =
  | 'post'
  | 'comment'
  | 'user'
  | 'conversation'
  | 'direct_message'
  | 'chatroom_message';

export type ReportCategory = 'illegal' | 'porn' | 'ad' | 'harassment' | 'other';

export type CreateReportInput = {
  reporterId: bigint;
  targetType: ReportTarget;
  targetId: string;
  category: ReportCategory;
  reason?: string;
  evidenceMessageIds?: string[];
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async reportTarget(data: CreateReportInput) {
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

  private async buildReportEvidence(
    targetType: ReportTarget,
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
      rawContent = post.title + '\n' + post.contentMd;
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
    targetType: ReportTarget,
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

  private async quarantineReportedTarget(targetType: ReportTarget, targetId: bigint) {
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

  private parseId(id: string): bigint {
    try {
      return BigInt(id);
    } catch {
      throw new BadRequestException('无效 ID');
    }
  }
}

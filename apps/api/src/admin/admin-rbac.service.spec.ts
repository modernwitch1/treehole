import { ForbiddenException } from '@nestjs/common';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';
import { AdminService } from './admin.service';

describe('AdminService role isolation', () => {
  const ordinaryAdmin: AdminPrincipal = { id: '2', username: 'staff', role: 'admin' };
  const moderator: AdminPrincipal = { id: '3', username: 'reviewer', role: 'moderator' };
  const superadmin: AdminPrincipal = { id: '1', username: 'developer', role: 'superadmin' };

  function serviceWith(prisma: Record<string, unknown> = {}) {
    return new AdminService(prisma as never, {} as never, {} as never);
  }

  it.each([
    [
      'user identity list',
      (service: AdminService) => service.listUsers({}, ordinaryAdmin, '127.0.0.1'),
    ],
    ['audit log', (service: AdminService) => service.listAuditLogs({}, ordinaryAdmin, '127.0.0.1')],
    [
      'appeal identity list',
      (service: AdminService) => service.listAppeals({}, ordinaryAdmin, '127.0.0.1'),
    ],
    [
      'sensitive rules',
      (service: AdminService) => service.listSensitiveWords({}, ordinaryAdmin, '127.0.0.1'),
    ],
    [
      'direct user suspension',
      (service: AdminService) =>
        service.suspendUser('9', '具体违规原因', 7, ordinaryAdmin, '127.0.0.1'),
    ],
    ['global statistics', (service: AdminService) => service.getStats(ordinaryAdmin)],
    ['global post list', (service: AdminService) => service.listPosts({}, ordinaryAdmin)],
    ['global comment list', (service: AdminService) => service.listComments({}, ordinaryAdmin)],
    ['moderation case list', (service: AdminService) => service.listModerationCases({}, ordinaryAdmin)],
    [
      'anonymous post identity',
      (service: AdminService) => service.revealPostAuthor('9', ordinaryAdmin, '127.0.0.1'),
    ],
    [
      'anonymous comment identity',
      (service: AdminService) => service.revealCommentAuthor('9', ordinaryAdmin, '127.0.0.1'),
    ],
    [
      'moderation-case identity',
      (service: AdminService) =>
        service.revealModerationCaseAuthor('9', ordinaryAdmin, '127.0.0.1'),
    ],
  ])('rejects an ordinary admin before querying the %s', async (_label, call) => {
    await expect(call(serviceWith())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects moderators from the same identity and configuration surfaces', async () => {
    const service = serviceWith();

    await expect(service.listUsers({}, moderator, '127.0.0.1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.listAuditLogs({}, moderator, '127.0.0.1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.listSensitiveWords({}, moderator, '127.0.0.1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.suspendUser('9', '具体违规原因', 7, moderator, '127.0.0.1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('redacts the reporter identity for every non-superadmin role', async () => {
    const createdAt = new Date('2026-07-12T08:00:00.000Z');
    const report = {
      id: 10n,
      reporter: { id: 22n, username: 'confidential-reporter' },
      handler: null,
      targetType: 'post',
      targetId: 33n,
      evidenceSnapshot: { content: '已固化的证据' },
      category: 'other',
      reason: '举报原因',
      status: 'open',
      priority: 1,
      version: 1,
      handledAt: null,
      resolutionNote: null,
      createdAt,
    };
    const prisma = {
      report: {
        findMany: jest.fn().mockResolvedValue([report]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = serviceWith(prisma);

    const [adminResult, moderatorResult, ownerResult] = await Promise.all([
      service.listReports({}, ordinaryAdmin),
      service.listReports({}, moderator),
      service.listReports({}, superadmin),
    ]);

    expect(adminResult.items[0].reporter).toEqual({
      id: 'redacted',
      username: '已验证举报用户',
    });
    expect(moderatorResult.items[0].reporter).toEqual({
      id: 'redacted',
      username: '已验证举报用户',
    });
    expect(ownerResult.items[0].reporter).toEqual({
      id: '22',
      username: 'confidential-reporter',
    });
  });

  it('does not audit routine user-list reads', async () => {
    const auditFailure = new Error('audit unavailable');
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 42n,
            email: 'private@pop.zjgsu.edu.cn',
            username: 'private-user',
            avatarUrl: null,
            role: 'user',
            status: 'active',
            emailVerifiedAt: new Date('2026-07-12T08:00:00.000Z'),
            suspendedUntil: null,
            lastLoginAt: null,
            lastLoginIp: '127.0.0.1',
            createdAt: new Date('2026-07-12T08:00:00.000Z'),
            _count: { posts: 0, comments: 0 },
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      report: { groupBy: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockRejectedValue(auditFailure) },
    };

    await expect(serviceWith(prisma).listUsers({}, superadmin, '127.0.0.1')).resolves.toMatchObject({
      total: 1,
    });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('reveals a post author student ID only after the disclosure audit is persisted', async () => {
    const events: string[] = [];
    const tx = {
      auditLog: {
        create: jest.fn().mockImplementation(async () => events.push('audit')),
      },
      post: {
        findUniqueOrThrow: jest.fn().mockImplementation(async () => {
          events.push('author');
          return { author: { id: 42n, username: 'private-user', email: 'private@pop.zjgsu.edu.cn' } };
        }),
      },
      registrationRequest: {
        findFirst: jest.fn().mockImplementation(async () => {
          events.push('student-id');
          return { studentId: '20260001' };
        }),
      },
    };
    const prisma = {
      post: { findUnique: jest.fn().mockResolvedValue({ id: 10n }) },
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };

    await expect(
      serviceWith(prisma).revealPostAuthor('10', superadmin, '127.0.0.1'),
    ).resolves.toEqual({
      id: '42',
      username: 'private-user',
      email: 'private@pop.zjgsu.edu.cn',
      studentId: '20260001',
    });
    expect(events).toEqual(['audit', 'author', 'student-id']);
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'post.reveal_author' }),
      }),
    );
  });
});

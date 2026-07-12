import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';
import { AdminTraceService } from './admin-trace.service';

describe('AdminTraceService', () => {
  const superadmin: AdminPrincipal = {
    id: '1',
    username: 'developer',
    role: 'superadmin',
  };

  function setup() {
    const events: string[] = [];
    const tx = {
      directMessage: {
        count: jest.fn().mockImplementation(async () => {
          events.push('count');
          return 1;
        }),
        findMany: jest.fn().mockImplementation(async () => {
          events.push('messages');
          return [];
        }),
      },
      auditLog: {
        create: jest.fn().mockImplementation(async () => {
          events.push('audit');
          return { id: 1n };
        }),
      },
      registrationRequest: {
        findMany: jest.fn().mockImplementation(async () => {
          events.push('registrations');
          return [];
        }),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    return {
      service: new AdminTraceService(prisma as never),
      prisma,
      tx,
      events,
    };
  }

  it('rejects admins before starting a database query', async () => {
    const { service, prisma } = setup();

    await expect(
      service.traceDirectMessages(
        { messageId: '9' },
        { id: '2', username: 'ordinary-admin', role: 'admin' },
        '127.0.0.1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires at least one exact trace filter', async () => {
    const { service, prisma } = setup();

    await expect(
      service.traceDirectMessages({ page: 1, pageSize: 20 }, superadmin, '127.0.0.1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not select or return sensitive records when audit persistence fails', async () => {
    const { service, tx } = setup();
    tx.auditLog.create.mockRejectedValueOnce(new Error('audit storage unavailable'));

    await expect(
      service.traceDirectMessages({ conversationId: '77' }, superadmin, '127.0.0.1'),
    ).rejects.toThrow('audit storage unavailable');
    expect(tx.directMessage.findMany).not.toHaveBeenCalled();
    expect(tx.registrationRequest.findMany).not.toHaveBeenCalled();
  });

  it('audits first and returns both parties with registration student IDs', async () => {
    const { service, tx, events } = setup();
    const createdAt = new Date('2026-07-12T08:00:00.000Z');
    tx.directMessage.findMany.mockImplementationOnce(async () => {
      events.push('messages');
      return [
        {
          id: 101n,
          contentMd: '私信原文',
          contentHtml: '<p>私信原文</p>',
          status: 'published',
          moderationLabels: null,
          senderIp: '203.0.113.8',
          senderUserAgent: 'test-browser',
          legalHold: false,
          readAt: null,
          createdAt,
          sender: { id: 11n, username: 'sender', email: 'sender@example.edu' },
          conversation: {
            id: 77n,
            originPostId: 55n,
            status: 'active',
            blockedById: null,
            lastMessageAt: createdAt,
            createdAt,
            updatedAt: createdAt,
            initiator: { id: 11n, username: 'sender', email: 'sender@example.edu' },
            recipient: { id: 22n, username: 'recipient', email: 'recipient@example.edu' },
          },
        },
      ];
    });
    tx.registrationRequest.findMany.mockImplementationOnce(async () => {
      events.push('registrations');
      return [
        { email: 'sender@example.edu', studentId: '20260001' },
        { email: 'recipient@example.edu', studentId: '20260002' },
      ];
    });

    const result = await service.traceDirectMessages(
      { userId: '11', page: 2, pageSize: 10 },
      superadmin,
      '127.0.0.1',
      'test-agent',
    );

    expect(events.indexOf('audit')).toBeLessThan(events.indexOf('messages'));
    expect(tx.directMessage.count).toHaveBeenCalledWith({
      where: {
        conversation: {
          is: { OR: [{ initiatorId: 11n }, { recipientId: 11n }] },
        },
      },
    });
    expect(tx.directMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'admin.trace.direct_messages.viewed',
        targetType: 'user',
        targetId: 11n,
      }),
    });
    expect(result.items[0]).toMatchObject({
      id: '101',
      contentMd: '私信原文',
      senderIp: '203.0.113.8',
      senderUserAgent: 'test-browser',
      sender: {
        uid: '11',
        username: 'sender',
        email: 'sender@example.edu',
        studentId: '20260001',
      },
      recipient: {
        uid: '22',
        username: 'recipient',
        email: 'recipient@example.edu',
        studentId: '20260002',
      },
      conversation: {
        id: '77',
        originPostId: '55',
        status: 'active',
      },
    });
  });
});

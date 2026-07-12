import type { AdminRole } from '../admin-auth/admin-auth.service';
import { ChatroomService } from './chatroom.service';

describe('ChatroomService admin identity isolation', () => {
  function setup() {
    const createdAt = new Date('2026-07-12T08:00:00.000Z');
    const prisma = {
      chatroom: {
        findUnique: jest.fn().mockResolvedValue({ id: 5n, uid: 'security-room' }),
      },
      chatroomMessage: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 9n,
            chatroomId: 5n,
            senderId: 7n,
            content: '聊天房消息',
            status: 'published',
            isFlagged: false,
            senderIp: '203.0.113.7',
            senderUserAgent: 'test-browser',
            createdAt,
          },
        ]),
      },
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 7n, username: 'real-user', email: 'real-user@example.edu' }]),
      },
      registrationRequest: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ email: 'real-user@example.edu', studentId: '20260007' }]),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 1n }),
      },
    };
    const config = {
      get: jest.fn((key: string) => (key === 'ANON_SECRET' ? 'test-anonymous-secret' : '')),
    };
    return {
      service: new ChatroomService(prisma as never, config as never, {} as never, {} as never),
      prisma,
    };
  }

  function context(role: AdminRole) {
    return {
      actorId: role === 'superadmin' ? 1n : 2n,
      role,
      ip: '127.0.0.1',
      userAgent: 'admin-browser',
    };
  }

  it.each<AdminRole>(['admin', 'moderator'])(
    'returns an anonymous DTO and never queries identity tables for %s',
    async (role) => {
      const { service, prisma } = setup();

      const result = await service.getMessagesForAdmin('security-room', context(role));

      expect(result[0]).toMatchObject({
        id: '9',
        senderNickname: expect.stringContaining('匿名'),
        content: '聊天房消息',
      });
      expect(result[0]).not.toHaveProperty('senderIp');
      expect(result[0]).not.toHaveProperty('realSender');
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(prisma.registrationRequest.findMany).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    },
  );

  it('returns UID, e-mail, student ID and IP to a superadmin only after auditing', async () => {
    const { service, prisma } = setup();

    const result = await service.getMessagesForAdmin('security-room', context('superadmin'));

    expect(result[0]).toMatchObject({
      senderIp: '203.0.113.7',
      realSender: {
        userId: '7',
        username: 'real-user',
        email: 'real-user@example.edu',
        studentId: '20260007',
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 1n,
        action: 'chatroom.identity.view',
        targetType: 'chatroom',
        targetId: 5n,
      }),
    });
  });

  it('does not return trace fields when the audit log cannot be persisted', async () => {
    const { service, prisma } = setup();
    prisma.auditLog.create.mockRejectedValueOnce(new Error('audit unavailable'));

    await expect(
      service.getMessagesForAdmin('security-room', context('superadmin')),
    ).rejects.toThrow('audit unavailable');
  });
});

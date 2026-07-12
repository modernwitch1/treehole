import { ChatroomService } from './chatroom.service';

describe('ChatroomService retention cleanup', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-12T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function setup(retentionDays = 180) {
    const prisma = {
      chatroom: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest
          .fn()
          .mockImplementation(async (input: { where: { legalHold: boolean } }) =>
            input.where.legalHold ? [{ id: 11n }] : [{ id: 22n, uid: 'expired-room' }],
          ),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      chatroomMessage: {
        deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      chatroomParticipant: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      $transaction: jest
        .fn()
        .mockImplementation(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'CHATROOM_RETENTION_DAYS') {
          return retentionDays;
        }
        throw new Error(`Unexpected config key: ${key}`);
      }),
    };
    const service = new ChatroomService(prisma as never, config as never, {} as never, {} as never);
    return { service, prisma };
  }

  it('uses one configured threshold for ordinary deletion and legal-hold minimization', async () => {
    const { service, prisma } = setup(180);
    const cleanup = service as unknown as { handleBackgroundCleanup(): Promise<void> };

    await cleanup.handleBackgroundCleanup();

    const threshold = new Date('2026-01-13T12:00:00.000Z');
    expect(prisma.chatroom.findMany).toHaveBeenNthCalledWith(1, {
      where: { createdAt: { lte: threshold }, legalHold: true },
      select: { id: true },
    });
    expect(prisma.chatroom.findMany).toHaveBeenNthCalledWith(2, {
      where: { createdAt: { lte: threshold }, legalHold: false },
      select: { id: true, uid: true },
    });
    expect(prisma.chatroomMessage.deleteMany).toHaveBeenCalledWith({
      where: { chatroomId: { in: [11n] }, legalHold: false },
    });
    expect(prisma.chatroomParticipant.deleteMany).toHaveBeenCalledWith({
      where: { chatroomId: { in: [11n] } },
    });
    expect(prisma.chatroom.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [22n] } } });
  });
});

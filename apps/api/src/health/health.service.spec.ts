import { HealthService } from './health.service';

describe('HealthService', () => {
  it('reports healthy dependencies without exposing implementation details', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const redis = { ping: jest.fn().mockResolvedValue('PONG') };
    const service = new HealthService(prisma as never, redis as never);

    await expect(service.checkReadiness()).resolves.toMatchObject({
      status: 'ok',
      components: {
        database: { status: 'up' },
        redis: { status: 'up' },
      },
    });
  });

  it('redacts dependency error messages from the public readiness response', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('postgresql://user:secret@db/internal')),
    };
    const redis = {
      ping: jest.fn().mockRejectedValue(new Error('redis://:secret@cache/internal')),
    };
    const service = new HealthService(prisma as never, redis as never);

    const report = await service.checkReadiness();

    expect(report).toMatchObject({
      status: 'degraded',
      components: {
        database: { status: 'down', error: 'unavailable' },
        redis: { status: 'down', error: 'unavailable' },
      },
    });
    expect(JSON.stringify(report)).not.toContain('secret');
    expect(JSON.stringify(report)).not.toContain('internal');
  });
});

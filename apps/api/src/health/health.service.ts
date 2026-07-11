import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { RedisService } from '../redis/redis.module';

export interface ComponentStatus {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

export interface ReadinessReport {
  status: 'ok' | 'degraded';
  components: {
    database: ComponentStatus;
    redis: ComponentStatus;
  };
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async checkLiveness(): Promise<{ status: 'ok'; timestamp: string }> {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  async checkReadiness(): Promise<ReadinessReport> {
    const [database, redis] = await Promise.all([this.checkDb(), this.checkRedis()]);
    const ok = database.status === 'up' && redis.status === 'up';
    return {
      status: ok ? 'ok' : 'degraded',
      components: { database, redis },
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDb(): Promise<ComponentStatus> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (err) {
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        error: (err as Error).message,
      };
    }
  }

  private async checkRedis(): Promise<ComponentStatus> {
    const start = Date.now();
    try {
      const pong = await this.redis.ping();
      if (pong !== 'PONG') {
        return { status: 'down', error: `unexpected reply: ${pong}` };
      }
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (err) {
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        error: (err as Error).message,
      };
    }
  }
}

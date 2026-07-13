import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { RedisService } from '../redis/redis.module';

export interface ComponentStatus {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: 'timeout' | 'unavailable' | 'unexpected_response';
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
  private readonly logger = new Logger(HealthService.name);
  private readonly dependencyTimeoutMs = 2_000;

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
      await this.withTimeout(this.prisma.$queryRaw`SELECT 1`);
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (err) {
      this.logDependencyFailure('database', err);
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        error: this.errorCode(err),
      };
    }
  }

  private async checkRedis(): Promise<ComponentStatus> {
    const start = Date.now();
    try {
      const pong = await this.withTimeout(this.redis.ping());
      if (pong !== 'PONG') {
        this.logger.warn('redis readiness check returned an unexpected response');
        return {
          status: 'down',
          latencyMs: Date.now() - start,
          error: 'unexpected_response',
        };
      }
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (err) {
      this.logDependencyFailure('redis', err);
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        error: this.errorCode(err),
      };
    }
  }

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error('DEPENDENCY_TIMEOUT')), this.dependencyTimeoutMs);
    });
    try {
      return await Promise.race([operation, deadline]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private errorCode(error: unknown): ComponentStatus['error'] {
    return error instanceof Error && error.message === 'DEPENDENCY_TIMEOUT'
      ? 'timeout'
      : 'unavailable';
  }

  private logDependencyFailure(component: string, error: unknown): void {
    const errorType = error instanceof Error ? error.name : 'UnknownError';
    this.logger.warn(`${component} readiness check failed (${errorType})`);
  }
}

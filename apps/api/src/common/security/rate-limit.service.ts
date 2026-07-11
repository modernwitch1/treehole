import { createHash } from 'node:crypto';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.module';

/**
 * A small, atomic fixed-window limiter shared by security-sensitive endpoints.
 * Subjects are hashed so attacker-controlled values cannot create unsafe or
 * excessively long Redis keys.
 */
@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  async consume(
    scope: string,
    subject: string,
    limit: number,
    windowSeconds: number,
    message = '操作过于频繁，请稍后再试',
  ): Promise<void> {
    const digest = createHash('sha256').update(subject).digest('hex');
    const key = `rate:${scope}:${digest}`;
    const count = (await this.redis.client.eval(
      `
        local current = redis.call('INCR', KEYS[1])
        if current == 1 then
          redis.call('EXPIRE', KEYS[1], ARGV[1])
        end
        return current
      `,
      1,
      key,
      windowSeconds,
    )) as number;

    if (count > limit) {
      throw new HttpException(
        { code: 'TOO_MANY_REQUESTS', message },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}

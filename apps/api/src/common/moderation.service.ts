import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { ContentStatus, SensitiveAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { RedisService } from '../redis/redis.module';

interface SensitiveRule {
  id: bigint;
  word: string;
  action: SensitiveAction;
}

interface ModerationResult {
  content: string;
  status: ContentStatus;
  blocked: boolean;
}

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);
  private cachedRules: SensitiveRule[] | null = null;
  private cacheExpiry = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async moderate(content: string): Promise<ModerationResult> {
    const rules = await this.getRules();
    if (rules.length === 0) {
      return { content, status: 'published', blocked: false };
    }

    const lower = content.toLowerCase();
    const matched = rules.filter((rule) => lower.includes(rule.word.toLowerCase()));

    if (matched.length === 0) {
      return { content, status: 'published', blocked: false };
    }

    this.prisma.sensitiveWord
      .updateMany({
        where: { id: { in: matched.map((r) => r.id) } },
        data: { hitCount: { increment: 1 } },
      })
      .catch((err) => this.logger.error('Failed to update sensitive word hitCount', err));

    const blocking = matched.find((r) => r.action === 'block');
    if (blocking) {
      return { content, status: 'published', blocked: true };
    }

    let moderated = content;
    for (const rule of matched) {
      if (rule.action === 'mask') {
        moderated = moderated.replace(new RegExp(this.escapeRegExp(rule.word), 'gi'), '***');
      }
    }

    const hasReview = matched.some((r) => r.action === 'review');
    return {
      content: moderated,
      status: hasReview ? 'pending_review' : 'published',
      blocked: false,
    };
  }

  async moderateOrThrow(content: string): Promise<{ content: string; status: ContentStatus }> {
    const result = await this.moderate(content);
    if (result.blocked) {
      throw new BadRequestException('内容包含禁止发布的敏感词');
    }
    return { content: result.content, status: result.status };
  }

  async reloadCache(): Promise<number> {
    this.cachedRules = null;
    this.cacheExpiry = 0;
    const rules = await this.getRules();
    return rules.length;
  }

  private async getRules(): Promise<SensitiveRule[]> {
    const now = Date.now();
    if (this.cachedRules && now < this.cacheExpiry) {
      return this.cachedRules;
    }

    try {
      const redisRules = await this.redis.client.get('sensitive-rules');
      if (redisRules) {
        this.cachedRules = JSON.parse(redisRules) as SensitiveRule[];
        this.cacheExpiry = now + 60_000;
        return this.cachedRules;
      }
    } catch {
      // Redis miss, fall through to DB
    }

    const rules = await this.prisma.sensitiveWord.findMany({
      where: { enabled: true },
      select: { id: true, word: true, action: true },
    });

    this.cachedRules = rules;
    this.cacheExpiry = now + 60_000;

    try {
      await this.redis.client.set('sensitive-rules', JSON.stringify(rules), 'EX', 120);
    } catch {
      // Redis write failure is non-critical
    }

    return rules;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

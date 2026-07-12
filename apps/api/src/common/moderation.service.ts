import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type {
  ContentStatus,
  ModerationSurface,
  Prisma,
  SensitiveAction,
  SensitiveCategory,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.module';
import { RedisService } from '../redis/redis.module';

interface SensitiveRule {
  id: string;
  word: string;
  category: SensitiveCategory;
  action: SensitiveAction;
}

export interface ModerationMatch {
  ruleId: string;
  category: SensitiveCategory;
  action: SensitiveAction;
  obfuscated: boolean;
}

export interface ModerationContext {
  surface: ModerationSurface;
  authorId?: bigint;
  ip?: string;
  userAgent?: string;
}

export interface ModerationResult {
  content: string;
  status: ContentStatus;
  blocked: boolean;
  matches: ModerationMatch[];
  reasonCodes: string[];
  riskLevel: number;
  contentHash: string;
}

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;
const MARKDOWN_NOISE = /[*_~`>#\[\](){}]/g;
const SEPARATOR_NOISE = /[\s\p{P}\p{S}]+/gu;
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>()]+/giu;
const CONTACT_SOLICITATION =
  /(?:加我|联系我|私聊|扫码|进群).{0,16}(?:微信|微.?信|v.?x|v.?信|q.?q|企鹅|电报|telegram)/iu;
const CHINESE_ID = /(?<!\d)\d{17}[\dXx](?!\d)/u;
const MOBILE_PHONE = /(?<!\d)1[3-9]\d{9}(?!\d)/u;
const EMAIL_ADDRESS = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/iu;
const PHONE_WITH_CONTEXT =
  /(?:电话|手机|手机号|联系方式|联系我|加我).{0,10}(?<!\d)1[3-9]\d{9}(?!\d)/u;
const EMAIL_WITH_CONTEXT =
  /(?:邮箱|邮件|联系我|账号).{0,12}[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/iu;
const BANK_CARD_WITH_CONTEXT = /(?:银行卡|卡号|收款|转账).{0,12}(?<!\d)(?:\d[ -]?){15,19}(?!\d)/u;
const SECRET_WITH_CONTEXT =
  /(?:验证码|密码|口令|密钥|token).{0,8}(?:[:：是为]?\s*)[a-z0-9_-]{4,}/iu;
const SUSPICIOUS_URL =
  /https?:\/\/(?:\d{1,3}(?:\.\d{1,3}){3}|[^/\s]*xn--|(?:bit\.ly|tinyurl\.com|t\.co|rebrand\.ly|shorturl\.at|cutt\.ly))(?:[/:?]|$)/iu;

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);
  private cachedRules: SensitiveRule[] | null = null;
  private cacheExpiry = 0;
  private cachedVersion = '0';
  private versionCheckExpiry = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async moderate(content: string): Promise<ModerationResult> {
    const rules = await this.getRules();
    const normalizedContent = this.normalizeForMatch(content);
    const plainLower = content.normalize('NFKC').toLocaleLowerCase('zh-CN');
    const matched = rules.filter((rule) =>
      normalizedContent.includes(this.normalizeForMatch(rule.word)),
    );
    const matches: ModerationMatch[] = matched.map((rule) => ({
      ruleId: rule.id,
      category: rule.category,
      action: rule.action,
      obfuscated: !plainLower.includes(rule.word.normalize('NFKC').toLocaleLowerCase('zh-CN')),
    }));

    if (matched.length > 0) {
      this.prisma.sensitiveWord
        .updateMany({
          where: { id: { in: matched.map((rule) => BigInt(rule.id)) } },
          data: { hitCount: { increment: 1 } },
        })
        .catch((error) => this.logger.error('Failed to update sensitive word hitCount', error));
    }

    const reasonCodes = new Set<string>();
    if (matches.some((match) => match.obfuscated)) {
      reasonCodes.add('obfuscated_sensitive_term');
    }
    if ((content.match(URL_PATTERN) ?? []).length >= 3) {
      reasonCodes.add('link_flood');
    }
    if (CONTACT_SOLICITATION.test(content)) {
      reasonCodes.add('contact_solicitation');
    }
    if (
      CHINESE_ID.test(content) ||
      MOBILE_PHONE.test(content) ||
      EMAIL_ADDRESS.test(content) ||
      PHONE_WITH_CONTEXT.test(content) ||
      EMAIL_WITH_CONTEXT.test(content) ||
      BANK_CARD_WITH_CONTEXT.test(content) ||
      SECRET_WITH_CONTEXT.test(content)
    ) {
      reasonCodes.add('personal_data_exposure');
    }
    if (SUSPICIOUS_URL.test(content)) {
      reasonCodes.add('suspicious_link');
    }

    let moderated = content.replace(ZERO_WIDTH, '');
    let maskCouldNotBeApplied = false;
    for (const rule of matched) {
      if (rule.action !== 'mask') {
        continue;
      }
      const next = moderated.replace(new RegExp(this.escapeRegExp(rule.word), 'giu'), '***');
      if (next === moderated) {
        maskCouldNotBeApplied = true;
      }
      moderated = next;
    }
    if (maskCouldNotBeApplied) {
      reasonCodes.add('obfuscated_mask_rule');
    }

    const blocked = matched.some((rule) => rule.action === 'block');
    const heuristicReview = [...reasonCodes].some((reason) =>
      [
        'link_flood',
        'contact_solicitation',
        'personal_data_exposure',
        'obfuscated_mask_rule',
        'suspicious_link',
      ].includes(reason),
    );
    const needsReview = matched.some((rule) => rule.action === 'review') || heuristicReview;
    const severeCategory = matched.some(
      (rule) => rule.category === 'political' || rule.category === 'porn',
    );
    const riskLevel = blocked ? 4 : needsReview ? (severeCategory ? 4 : 3) : matched.length ? 1 : 0;

    return {
      content: moderated,
      status: needsReview ? 'pending_review' : 'published',
      blocked,
      matches,
      reasonCodes: [...reasonCodes],
      riskLevel,
      contentHash: createHash('sha256').update(content).digest('hex'),
    };
  }

  async moderateOrThrow(content: string, context?: ModerationContext): Promise<ModerationResult> {
    const result = await this.moderate(content);
    if (context?.authorId !== undefined && !result.blocked) {
      await this.applyBehavioralSignals(result, { ...context, authorId: context.authorId });
    }
    if (result.blocked) {
      if (context) {
        await this.recordCase(result, context, undefined, content);
      }
      throw new BadRequestException({
        code: 'CONTENT_BLOCKED',
        message: '内容可能违反社区规则，请修改后重试',
      });
    }
    return result;
  }

  async recordCase(
    result: ModerationResult,
    context: ModerationContext,
    targetId: bigint | undefined,
    originalContent: string,
  ) {
    if (!result.blocked && result.status !== 'pending_review') {
      return null;
    }
    const data = {
      author: context.authorId ? { connect: { id: context.authorId } } : undefined,
      status: 'pending' as const,
      riskLevel: result.riskLevel,
      reasonCodes: result.reasonCodes as Prisma.InputJsonValue,
      matchedRules: result.matches as unknown as Prisma.InputJsonValue,
      contentHash: result.contentHash,
      contentExcerpt: this.safeExcerpt(originalContent),
      sourceIp: context.ip && context.ip !== 'unknown' ? context.ip : undefined,
      sourceUserAgent: context.userAgent?.slice(0, 512),
      legalHold: result.riskLevel >= 4,
    };

    if (targetId) {
      return this.prisma.moderationCase.upsert({
        where: { surface_targetId: { surface: context.surface, targetId } },
        create: { surface: context.surface, targetId, ...data },
        update: {
          ...data,
          version: { increment: 1 },
          updatedAt: new Date(),
        },
      });
    }
    return this.prisma.moderationCase.create({
      data: { surface: context.surface, ...data },
    });
  }

  moderationLabels(result: ModerationResult) {
    return {
      riskLevel: result.riskLevel,
      reasonCodes: result.reasonCodes,
      matches: result.matches,
    };
  }

  async reloadCache(): Promise<number> {
    this.cachedRules = null;
    this.cacheExpiry = 0;
    this.versionCheckExpiry = 0;
    try {
      await this.redis.client.multi().del('sensitive-rules').incr('sensitive-rules:version').exec();
    } catch (error) {
      this.logger.warn(`Unable to broadcast moderation cache invalidation: ${String(error)}`);
    }
    const rules = await this.getRules();
    return rules.length;
  }

  private async getRules(): Promise<SensitiveRule[]> {
    const now = Date.now();
    if (now >= this.versionCheckExpiry) {
      try {
        const version = (await this.redis.client.get('sensitive-rules:version')) ?? '0';
        if (version !== this.cachedVersion) {
          this.cachedRules = null;
          this.cacheExpiry = 0;
          this.cachedVersion = version;
        }
      } catch {
        // Database fallback below remains authoritative.
      }
      this.versionCheckExpiry = now + 5_000;
    }
    if (this.cachedRules && now < this.cacheExpiry) {
      return this.cachedRules;
    }

    try {
      const redisRules = await this.redis.client.get('sensitive-rules');
      if (redisRules) {
        const parsed = JSON.parse(redisRules) as SensitiveRule[];
        if (Array.isArray(parsed)) {
          this.cachedRules = parsed;
          this.cacheExpiry = now + 60_000;
          return parsed;
        }
      }
    } catch {
      // Redis miss or corrupt cache: fall through to the database.
    }

    const databaseRules = await this.prisma.sensitiveWord.findMany({
      where: { enabled: true },
      select: { id: true, word: true, category: true, action: true },
    });
    const rules: SensitiveRule[] = databaseRules.map((rule) => ({
      ...rule,
      id: String(rule.id),
    }));
    this.cachedRules = rules;
    this.cacheExpiry = now + 60_000;

    try {
      await this.redis.client.set('sensitive-rules', JSON.stringify(rules), 'EX', 120);
    } catch {
      // A cache write failure must never disable moderation.
    }
    return rules;
  }

  private normalizeForMatch(value: string) {
    return value
      .normalize('NFKC')
      .replace(ZERO_WIDTH, '')
      .replace(MARKDOWN_NOISE, '')
      .toLocaleLowerCase('zh-CN')
      .replace(SEPARATOR_NOISE, '');
  }

  private safeExcerpt(content: string) {
    return content
      .replace(/!\[[^\]]*]\([^)]+\)/g, '[图片]')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500);
  }

  private async applyBehavioralSignals(
    result: ModerationResult,
    context: ModerationContext & { authorId: bigint },
  ) {
    // Repetition detection uses the same bypass-resistant normalization as the
    // rule matcher, while contentHash remains the exact evidence hash.
    const behaviorHash = createHash('sha256')
      .update(this.normalizeForMatch(result.content))
      .digest('hex');
    const key = `moderation:repeat:${context.surface}:${context.authorId}:${behaviorHash}`;
    try {
      const count = (await this.redis.client.eval(
        `
          local current = redis.call('INCR', KEYS[1])
          if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
          return current
        `,
        1,
        key,
        600,
      )) as number;
      if (count >= 3) {
        if (!result.reasonCodes.includes('duplicate_content_burst')) {
          result.reasonCodes.push('duplicate_content_burst');
        }
        result.status = 'pending_review';
        result.riskLevel = Math.max(result.riskLevel, 3);
      }
    } catch (error) {
      this.logger.warn(`Unable to evaluate duplicate-content signal: ${String(error)}`);
    }
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

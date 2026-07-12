import { ModerationService } from './moderation.service';

describe('ModerationService', () => {
  function setup(
    rules: Array<{
      id: bigint;
      word: string;
      category: 'political' | 'porn' | 'violence' | 'ad' | 'other';
      action: 'block' | 'review' | 'mask';
    }> = [],
  ) {
    const prisma = {
      sensitiveWord: {
        findMany: jest.fn().mockResolvedValue(rules),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      moderationCase: {
        create: jest.fn(),
        upsert: jest.fn(),
      },
    };
    const redis = {
      client: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        eval: jest.fn().mockResolvedValue(1),
        multi: jest.fn(),
      },
    };
    return {
      service: new ModerationService(prisma as never, redis as never),
      prisma,
      redis,
    };
  }

  it('detects separator and Markdown obfuscation of a blocking rule', async () => {
    const { service } = setup([{ id: 1n, word: '违禁词', category: 'porn', action: 'block' }]);

    const result = await service.moderate('违*禁 词');

    expect(result.blocked).toBe(true);
    expect(result.riskLevel).toBe(4);
    expect(result.reasonCodes).toContain('obfuscated_sensitive_term');
    expect(result.matches[0]).toMatchObject({ ruleId: '1', obfuscated: true });
  });

  it('routes standalone phone numbers and email addresses to review', async () => {
    const { service } = setup();

    const result = await service.moderate('手机号 13800138000，邮箱 test@example.com');

    expect(result.status).toBe('pending_review');
    expect(result.riskLevel).toBe(3);
    expect(result.reasonCodes).toContain('personal_data_exposure');
  });

  it('masks an exact mask rule without publishing the original token', async () => {
    const { service } = setup([{ id: 2n, word: '微信号', category: 'ad', action: 'mask' }]);

    const result = await service.moderate('请勿留下微信号');

    expect(result.status).toBe('published');
    expect(result.content).toBe('请勿留下***');
    expect(result.riskLevel).toBe(1);
  });

  it('uses level 3 for an ordinary review rule and keeps the concrete match evidence', async () => {
    const { service } = setup([{ id: 3n, word: '引流词', category: 'ad', action: 'review' }]);

    const result = await service.moderate('这里包含引流词');

    expect(result).toMatchObject({ status: 'pending_review', blocked: false, riskLevel: 3 });
    expect(result.matches).toEqual([
      { ruleId: '3', category: 'ad', action: 'review', obfuscated: false },
    ]);
  });

  it('uses level 4 for a severe-category review rule without treating the score as a conviction', async () => {
    const { service } = setup([{ id: 4n, word: '严重风险词', category: 'porn', action: 'review' }]);

    const result = await service.moderate('引用严重风险词作为课程讨论');

    expect(result).toMatchObject({ status: 'pending_review', blocked: false, riskLevel: 4 });
    expect(result.matches[0]).toMatchObject({ category: 'porn', action: 'review' });
  });

  it('keeps clean content at level 0', async () => {
    const { service } = setup();

    const result = await service.moderate('今天的课程笔记已经整理好了');

    expect(result).toMatchObject({ status: 'published', blocked: false, riskLevel: 0 });
    expect(result.matches).toEqual([]);
    expect(result.reasonCodes).toEqual([]);
  });

  it('holds the third duplicate submission for review', async () => {
    const { service, redis } = setup();
    redis.client.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    const context = { surface: 'comment' as const, authorId: 7n };

    await service.moderateOrThrow('重复内容', context);
    await service.moderateOrThrow('重 复内容', context);
    const third = await service.moderateOrThrow('重*复内容', context);

    expect(third.status).toBe('pending_review');
    expect(third.riskLevel).toBe(3);
    expect(third.reasonCodes).toContain('duplicate_content_burst');
    const keys = redis.client.eval.mock.calls.map((call) => call[2]);
    expect(new Set(keys).size).toBe(1);
  });
});

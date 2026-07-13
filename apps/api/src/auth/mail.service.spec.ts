import { MailProviderError, MailService } from './mail.service';

type FakeConfigValues = Record<string, unknown>;

function createService(values: FakeConfigValues = {}) {
  const configValues: FakeConfigValues = {
    MAIL_DRIVER: 'brevo',
    MAIL_PROVIDER_ORDER: 'brevo,mailjet',
    MAIL_FAILOVER_ON_TRANSIENT: true,
    MAIL_PROVIDER_TIMEOUT_MS: 1000,
    MAIL_PROVIDER_FAILURE_THRESHOLD: 3,
    MAIL_PROVIDER_COOLDOWN_SECONDS: 120,
    MAIL_FROM: 'no-reply@unidating.top',
    MAIL_FROM_NAME: '浙工商树洞',
    BREVO_API_KEY: 'brevo-test-key',
    BREVO_API_URL: 'https://api.brevo.test/v3/smtp/email',
    MAILJET_API_KEY: 'mailjet-test-key',
    MAILJET_API_SECRET: 'mailjet-test-secret',
    MAILJET_API_URL: 'https://api.mailjet.test/v3.1/send',
    AWS_REGION: 'ap-northeast-1',
    ...values,
  };
  const config = {
    get: (key: string) => configValues[key],
  };
  const client = {
    exists: jest.fn().mockResolvedValue(0),
    del: jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    set: jest.fn().mockResolvedValue('OK'),
  };
  const redis = { client };
  return {
    service: new MailService(config as never, redis as never),
    client,
  };
}

function response(status: number, body = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('MailService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('fails over only after a transient provider failure', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response(503, 'temporary outage'))
      .mockResolvedValueOnce(response(200, JSON.stringify({ Messages: [{ Status: 'success' }] })));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service, client } = createService();

    await service.sendVerificationCode('student@pop.zjgsu.edu.cn', '123456');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.brevo.test/v3/smtp/email');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.mailjet.test/v3.1/send');
    expect(client.incr).toHaveBeenCalledWith('mail:circuit:failures:brevo');
    expect(client.del).toHaveBeenCalledWith(
      'mail:circuit:failures:mailjet',
      'mail:circuit:open:mailjet',
    );
  });

  it('does not use a backup provider for quota or authentication 4xx errors', async () => {
    const fetchMock = jest.fn().mockResolvedValue(response(429, 'quota exceeded'));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service } = createService();

    await expect(
      service.sendVerificationCode('student@pop.zjgsu.edu.cn', '123456'),
    ).rejects.toThrow('brevo:http:429');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips an optional provider that has no credentials', async () => {
    const fetchMock = jest.fn().mockResolvedValue(response(200, '{}'));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service } = createService({ BREVO_API_KEY: '' });

    await service.sendVerificationCode('student@pop.zjgsu.edu.cn', '123456');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.mailjet.test/v3.1/send');
  });

  it('classifies provider errors without exposing credentials', () => {
    const error = new MailProviderError('brevo', 'http', 'HTTP 401', false, 401);
    expect(error.retryable).toBe(false);
    expect(error.message).not.toContain('test-key');
  });
});

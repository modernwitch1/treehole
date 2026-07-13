import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { AppConfig } from '../config/app.config';
import { RedisService } from '../redis/redis.module';

type MailProvider = 'brevo' | 'mailjet' | 'smtp2go' | 'mailgun' | 'resend' | 'ses' | 'smtp';

type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type MailProviderErrorCode = 'configuration' | 'http' | 'network' | 'smtp' | 'ses' | 'unknown';

export class MailProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly code: MailProviderErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MailProviderError';
  }
}

/**
 * Transactional email delivery with provider-aware failover.
 *
 * Failover is deliberately restricted to transport failures and 5xx responses.
 * Authentication errors, unverified senders, quota responses and other 4xx
 * responses stop the chain immediately so the application never uses a second
 * provider to bypass a provider's sending policy or quota.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private sesClient?: SESClient;
  private smtpTransport?: nodemailer.Transporter<SMTPTransport.SentMessageInfo>;
  private resendClient?: Resend;

  constructor(
    private readonly config: AppConfig,
    private readonly redis: RedisService,
  ) {}

  async sendVerificationCode(to: string, code: string) {
    await this.sendMail({
      to,
      subject: '浙工商树洞邮箱验证码',
      text: `你的浙工商树洞验证码是 ${code}，有效期 24 小时。若非本人操作，请忽略本邮件。`,
      html: [
        '<div style="font-family:Arial,sans-serif;line-height:1.7;color:#111827">',
        '<h2 style="margin:0 0 12px">浙工商树洞邮箱验证码</h2>',
        `<p>你的验证码是 <strong style="font-size:24px;letter-spacing:4px">${code}</strong></p>`,
        '<p>验证码有效期 24 小时。若非本人操作，请忽略本邮件。</p>',
        '</div>',
      ].join(''),
    });
  }

  async sendPasswordResetLink(to: string, resetUrl: string) {
    const safeResetUrl = this.escapeHtml(resetUrl);
    await this.sendMail({
      to,
      subject: '浙工商树洞密码重置',
      text: `你正在重置浙工商树洞的密码，请点击以下链接完成重置（1小时内有效）：${resetUrl}。若非本人操作，请忽略本邮件。`,
      html: [
        '<div style="font-family:Arial,sans-serif;line-height:1.7;color:#111827">',
        '<h2 style="margin:0 0 12px">浙工商树洞密码重置</h2>',
        '<p>你正在重置浙工商树洞的密码，点击以下按钮完成重置（1小时内有效）：</p>',
        `<p><a href="${safeResetUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">重置密码</a></p>`,
        `<p style="color:#6b7280;font-size:14px">如果按钮无法点击，请复制以下链接到浏览器打开：<br/>${safeResetUrl}</p>`,
        '<p style="color:#6b7280;font-size:14px">若非本人操作，请忽略本邮件。</p>',
        '</div>',
      ].join(''),
    });
  }

  private async sendMail(message: MailMessage) {
    const providers = this.getProviderOrder();
    if (providers.length === 0) {
      throw new Error('没有配置可用的邮件服务商');
    }

    const messageId = randomUUID();
    const failures: string[] = [];

    for (const provider of providers) {
      if (await this.isCircuitOpen(provider)) {
        this.logger.warn(`Skipping open mail provider circuit: ${provider}`);
        failures.push(`${provider}:circuit-open`);
        continue;
      }

      try {
        await this.sendThroughProvider(provider, message, messageId);
        await this.recordProviderSuccess(provider);
        this.logger.log(
          `Sent email through ${provider} (${messageId}) to ${this.maskEmail(message.to)}`,
        );
        return;
      } catch (error) {
        const normalized = this.normalizeProviderError(provider, error);
        failures.push(
          `${provider}:${normalized.code}${normalized.status ? `:${normalized.status}` : ''}`,
        );

        // A missing optional credential should not make a configured backup
        // unusable. A rejected request must stop the chain immediately.
        if (normalized.code === 'configuration') {
          this.logger.error(`Mail provider ${provider} is not configured`);
          continue;
        }

        await this.recordProviderFailure(provider, normalized);
        this.logger.error(
          `Mail provider ${provider} failed (${normalized.code}${normalized.status ? `/${normalized.status}` : ''})`,
        );

        if (!normalized.retryable || !this.config.get('MAIL_FAILOVER_ON_TRANSIENT')) {
          break;
        }
      }
    }

    throw new Error(`邮件发送失败（${failures.join(', ')}）`);
  }

  private getProviderOrder(): MailProvider[] {
    const configured = this.config.get('MAIL_PROVIDER_ORDER');
    const candidates = (
      configured?.trim() ? configured.split(',') : [this.config.get('MAIL_DRIVER')]
    )
      .map((provider) => provider.trim().toLowerCase())
      .filter(Boolean);
    const unique = [...new Set(candidates)];
    const validProviders = new Set<MailProvider>([
      'brevo',
      'mailjet',
      'smtp2go',
      'mailgun',
      'resend',
      'ses',
      'smtp',
    ]);

    return unique.filter((provider): provider is MailProvider => {
      if (validProviders.has(provider as MailProvider)) {
        return true;
      }
      this.logger.error(`Ignoring unknown mail provider: ${provider}`);
      return false;
    });
  }

  private async sendThroughProvider(
    provider: MailProvider,
    message: MailMessage,
    messageId: string,
  ) {
    switch (provider) {
      case 'brevo':
        await this.sendThroughBrevo(message, messageId);
        return;
      case 'mailjet':
        await this.sendThroughMailjet(message, messageId);
        return;
      case 'smtp2go':
        await this.sendThroughSmtp2Go(message, messageId);
        return;
      case 'mailgun':
        await this.sendThroughMailgun(message, messageId);
        return;
      case 'resend':
        await this.sendThroughResend(message, messageId);
        return;
      case 'ses':
        await this.sendThroughSes(message);
        return;
      case 'smtp':
        await this.sendThroughSmtp(message);
        return;
    }
  }

  private async sendThroughBrevo(message: MailMessage, messageId: string) {
    const apiKey = this.config.get('BREVO_API_KEY');
    if (!apiKey) {
      throw this.configurationError('brevo', 'BREVO_API_KEY');
    }

    await this.fetchProvider('brevo', this.config.get('BREVO_API_URL'), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
        'x-request-id': messageId,
      },
      body: JSON.stringify({
        sender: this.senderPayload(),
        to: [{ email: message.to }],
        subject: message.subject,
        textContent: message.text,
        htmlContent: message.html,
        headers: { 'X-Entity-Ref-ID': messageId },
      }),
    });
  }

  private async sendThroughMailjet(message: MailMessage, messageId: string) {
    const apiKey = this.config.get('MAILJET_API_KEY');
    const apiSecret = this.config.get('MAILJET_API_SECRET');
    if (!apiKey || !apiSecret) {
      throw this.configurationError('mailjet', 'MAILJET_API_KEY/MAILJET_API_SECRET');
    }

    await this.fetchProvider('mailjet', this.config.get('MAILJET_API_URL'), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`,
        'x-request-id': messageId,
      },
      body: JSON.stringify({
        Messages: [
          {
            From: this.senderPayload({ capitalized: true }),
            To: [{ Email: message.to }],
            Subject: message.subject,
            TextPart: message.text,
            HTMLPart: message.html,
          },
        ],
      }),
    });
  }

  private async sendThroughSmtp2Go(message: MailMessage, messageId: string) {
    const apiKey = this.config.get('SMTP2GO_API_KEY');
    if (!apiKey) {
      throw this.configurationError('smtp2go', 'SMTP2GO_API_KEY');
    }

    await this.fetchProvider('smtp2go', this.config.get('SMTP2GO_API_URL'), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-smtp2go-api-key': apiKey,
        'x-request-id': messageId,
      },
      body: JSON.stringify({
        sender: this.config.get('MAIL_FROM'),
        to: [message.to],
        subject: message.subject,
        text_body: message.text,
        html_body: message.html,
      }),
    });
  }

  private async sendThroughMailgun(message: MailMessage, messageId: string) {
    const apiKey = this.config.get('MAILGUN_API_KEY');
    const domain = this.config.get('MAILGUN_DOMAIN');
    if (!apiKey || !domain) {
      throw this.configurationError('mailgun', 'MAILGUN_API_KEY/MAILGUN_DOMAIN');
    }

    const body = new FormData();
    body.append('from', this.config.get('MAIL_FROM'));
    body.append('to', message.to);
    body.append('subject', message.subject);
    body.append('text', message.text);
    body.append('html', message.html);
    body.append('h:X-Entity-Ref-ID', messageId);

    const baseUrl = this.config.get('MAILGUN_API_BASE_URL').replace(/\/$/, '');
    await this.fetchProvider('mailgun', `${baseUrl}/v3/${encodeURIComponent(domain)}/messages`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
        'x-request-id': messageId,
      },
      body,
    });
  }

  private async sendThroughResend(message: MailMessage, messageId: string) {
    const apiKey = this.config.get('RESEND_API_KEY');
    if (!apiKey) {
      throw this.configurationError('resend', 'RESEND_API_KEY');
    }

    let result: Awaited<ReturnType<Resend['emails']['send']>>;
    try {
      result = await this.getResendClient().emails.send(
        {
          from: this.config.get('MAIL_FROM'),
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        },
        { idempotencyKey: messageId },
      );
    } catch (error) {
      const status = this.getStatusCode(error);
      throw new MailProviderError(
        'resend',
        status !== undefined ? 'http' : 'network',
        'Resend request failed',
        status === undefined || status >= 500,
        status,
        { cause: error },
      );
    }
    if (result.error) {
      const status = result.error.statusCode ?? undefined;
      throw new MailProviderError(
        'resend',
        'http',
        result.error.message,
        status !== undefined && status >= 500,
        status,
      );
    }
    if (!result.data?.id) {
      throw new MailProviderError('resend', 'unknown', 'Resend returned no message id', true);
    }
  }

  private async sendThroughSes(message: MailMessage) {
    try {
      await this.getSesClient().send(
        new SendEmailCommand({
          Source: this.config.get('MAIL_FROM'),
          Destination: { ToAddresses: [message.to] },
          Message: {
            Subject: { Data: message.subject, Charset: 'UTF-8' },
            Body: {
              Text: { Data: message.text, Charset: 'UTF-8' },
              Html: { Data: message.html, Charset: 'UTF-8' },
            },
          },
        }),
      );
    } catch (error) {
      const status = this.getStatusCode(error);
      throw new MailProviderError(
        'ses',
        'ses',
        'SES request failed',
        status !== undefined && status >= 500,
        status,
        { cause: error },
      );
    }
  }

  private async sendThroughSmtp(message: MailMessage) {
    try {
      await this.getSmtpTransport().sendMail({
        from: this.config.get('MAIL_FROM'),
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } catch (error) {
      const status = this.getStatusCode(error);
      const code = this.getErrorCode(error);
      const retryable =
        ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNRESET', 'EAI_AGAIN'].includes(code) ||
        (status !== undefined && status >= 500);
      throw new MailProviderError('smtp', 'smtp', 'SMTP request failed', retryable, status, {
        cause: error,
      });
    }
  }

  private async fetchProvider(provider: MailProvider, url: string, init: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.get('MAIL_PROVIDER_TIMEOUT_MS'),
    );

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const body = await response.text();
      if (!response.ok) {
        throw new MailProviderError(
          provider,
          'http',
          `provider returned HTTP ${response.status}${body ? `: ${this.truncate(body)}` : ''}`,
          response.status >= 500,
          response.status,
        );
      }
    } catch (error) {
      if (error instanceof MailProviderError) {
        throw error;
      }
      throw new MailProviderError(provider, 'network', 'provider request failed', true, undefined, {
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private getSesClient() {
    this.sesClient ??= new SESClient({ region: this.config.get('AWS_REGION') });
    return this.sesClient;
  }

  private getResendClient() {
    this.resendClient ??= new Resend(this.config.get('RESEND_API_KEY'));
    return this.resendClient;
  }

  private getSmtpTransport() {
    if (this.smtpTransport) {
      return this.smtpTransport;
    }

    const user = this.config.get('SMTP_USER');
    const pass = this.config.get('SMTP_PASSWORD');
    const port = this.config.get('SMTP_PORT') ?? 587;

    this.smtpTransport = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST'),
      port,
      secure: port === 465,
      connectionTimeout: this.config.get('MAIL_PROVIDER_TIMEOUT_MS'),
      greetingTimeout: this.config.get('MAIL_PROVIDER_TIMEOUT_MS'),
      socketTimeout: this.config.get('MAIL_PROVIDER_TIMEOUT_MS'),
      auth: user && pass ? { user, pass } : undefined,
    });
    return this.smtpTransport;
  }

  private senderPayload(options?: { capitalized?: boolean }) {
    const email = this.config.get('MAIL_FROM');
    const name = this.config.get('MAIL_FROM_NAME');
    if (options?.capitalized) {
      return name ? { Email: email, Name: name } : { Email: email };
    }
    return name ? { email, name } : { email };
  }

  private configurationError(provider: MailProvider, setting: string) {
    return new MailProviderError(provider, 'configuration', `missing ${setting}`, false);
  }

  private normalizeProviderError(provider: MailProvider, error: unknown) {
    if (error instanceof MailProviderError) {
      return error;
    }
    return new MailProviderError(
      provider,
      'unknown',
      'unexpected provider error',
      false,
      undefined,
      {
        cause: error,
      },
    );
  }

  private async isCircuitOpen(provider: MailProvider) {
    try {
      return (await this.redis.client.exists(this.circuitKey(provider))) > 0;
    } catch (error) {
      this.logger.warn(
        `Unable to read mail circuit state for ${provider}: ${this.errorMessage(error)}`,
      );
      return false;
    }
  }

  private async recordProviderSuccess(provider: MailProvider) {
    try {
      await this.redis.client.del(this.failureKey(provider), this.circuitKey(provider));
    } catch (error) {
      this.logger.warn(
        `Unable to clear mail circuit state for ${provider}: ${this.errorMessage(error)}`,
      );
    }
  }

  private async recordProviderFailure(provider: MailProvider, error: MailProviderError) {
    if (!error.retryable) {
      return;
    }

    try {
      const failures = (await this.redis.client.incr(this.failureKey(provider))) as number;
      if (failures === 1) {
        await this.redis.client.expire(this.failureKey(provider), 300);
      }
      if (failures >= this.config.get('MAIL_PROVIDER_FAILURE_THRESHOLD')) {
        await this.redis.client.set(
          this.circuitKey(provider),
          '1',
          'EX',
          this.config.get('MAIL_PROVIDER_COOLDOWN_SECONDS'),
        );
      }
    } catch (redisError) {
      this.logger.warn(
        `Unable to record mail circuit state for ${provider}: ${this.errorMessage(redisError)}`,
      );
    }
  }

  private failureKey(provider: MailProvider) {
    return `mail:circuit:failures:${provider}`;
  }

  private circuitKey(provider: MailProvider) {
    return `mail:circuit:open:${provider}`;
  }

  private getStatusCode(error: unknown) {
    if (typeof error !== 'object' || error === null) {
      return undefined;
    }
    const typedError = error as {
      statusCode?: unknown;
      responseCode?: unknown;
      status?: unknown;
      response?: { statusCode?: unknown; status?: unknown };
      $metadata?: { httpStatusCode?: unknown };
    };
    const candidates = [
      typedError.statusCode,
      typedError.responseCode,
      typedError.status,
      typedError.response?.statusCode,
      typedError.response?.status,
      typedError.$metadata?.httpStatusCode,
    ];
    return candidates.find((value): value is number => typeof value === 'number');
  }

  private getErrorCode(error: unknown) {
    if (typeof error !== 'object' || error === null) {
      return '';
    }
    const value = (error as { code?: unknown }).code;
    return typeof value === 'string' ? value : '';
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  private truncate(value: string) {
    return value.replace(/\s+/g, ' ').slice(0, 240);
  }

  private maskEmail(email: string) {
    const [local, domain] = email.split('@');
    if (!local || !domain) {
      return '***';
    }
    return `${local.slice(0, 1)}***@${domain}`;
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };
      return entities[character] ?? character;
    });
  }
}

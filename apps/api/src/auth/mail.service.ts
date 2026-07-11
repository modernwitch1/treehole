import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { AppConfig } from '../config/app.config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private sesClient?: SESClient;
  private smtpTransport?: nodemailer.Transporter<SMTPTransport.SentMessageInfo>;
  private resendClient?: Resend;

  constructor(private readonly config: AppConfig) {}

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
    await this.sendMail({
      to,
      subject: '浙工商树洞密码重置',
      text: `你正在重置浙工商树洞的密码，请点击以下链接完成重置（1小时内有效）：${resetUrl}。若非本人操作，请忽略本邮件。`,
      html: [
        '<div style="font-family:Arial,sans-serif;line-height:1.7;color:#111827">',
        '<h2 style="margin:0 0 12px">浙工商树洞密码重置</h2>',
        '<p>你正在重置浙工商树洞的密码，点击以下按钮完成重置（1小时内有效）：</p>',
        `<p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">重置密码</a></p>`,
        `<p style="color:#6b7280;font-size:14px">如果按钮无法点击，请复制以下链接到浏览器打开：<br/>${resetUrl}</p>`,
        '<p style="color:#6b7280;font-size:14px">若非本人操作，请忽略本邮件。</p>',
        '</div>',
      ].join(''),
    });
  }

  private async sendMail(message: { to: string; subject: string; text: string; html: string }) {
    const from = this.config.get('MAIL_FROM');
    const driver = this.config.get('MAIL_DRIVER');

    if (driver === 'ses') {
      const client = this.getSesClient();
      await client.send(
        new SendEmailCommand({
          Source: from,
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
      this.logger.log(`Sent email through SES to ${message.to}`);
      return;
    }

    if (driver === 'resend') {
      const client = this.getResendClient();
      await client.emails.send({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      this.logger.log(`Sent email through Resend to ${message.to}`);
      return;
    }

    // Default: SMTP
    const transport = this.getSmtpTransport();
    await transport.sendMail({ from, ...message });
    this.logger.log(`Sent email through SMTP to ${message.to}`);
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
      auth: user && pass ? { user, pass } : undefined,
    });
    return this.smtpTransport;
  }
}

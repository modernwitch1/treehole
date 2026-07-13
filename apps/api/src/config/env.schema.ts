import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  // App
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  APP_PORT: Joi.number().port().default(3000),
  APP_HOST: Joi.string().default('0.0.0.0'),
  APP_BASE_URL: Joi.string().uri().required(),
  FRONTEND_ORIGIN: Joi.string().uri().required(),
  MERCHANT_ORIGIN: Joi.string().uri().default('https://merchant.unidating.top'),
  ADMIN_ORIGIN: Joi.string().uri().optional().allow(''),
  ALLOWED_EMAIL_DOMAIN: Joi.string()
    .pattern(/^[a-z0-9.-]+\.[a-z]{2,}$/i)
    .default('pop.zjgsu.edu.cn'),

  // Data retention
  CHATROOM_RETENTION_DAYS: Joi.number().integer().min(30).max(3650).default(180),

  // Database
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),

  // Redis
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),

  // JWT
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL_SECONDS: Joi.number().integer().min(60).default(900),
  JWT_REFRESH_TTL_SECONDS: Joi.number().integer().min(3600).default(2_592_000),
  ADMIN_TOTP_SECRET: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required(),
    otherwise: Joi.optional().allow(''),
  }),

  // Anonymous
  ANON_SECRET: Joi.string().min(32).required(),

  // AWS / S3
  AWS_REGION: Joi.string().default('ap-northeast-1'),
  AWS_ACCESS_KEY_ID: Joi.string().optional().allow(''),
  AWS_SECRET_ACCESS_KEY: Joi.string().optional().allow(''),
  S3_ENDPOINT: Joi.string().uri().optional().allow(''),
  S3_FORCE_PATH_STYLE: Joi.boolean().truthy('true').falsy('false').default(false),
  S3_UPLOADS_BUCKET: Joi.string().required(),
  S3_AVATARS_BUCKET: Joi.string().required(),
  CDN_BASE_URL: Joi.string().uri().required(),

  // Email
  MAIL_DRIVER: Joi.string()
    .valid('smtp', 'ses', 'resend', 'brevo', 'mailjet', 'smtp2go', 'mailgun')
    .default('smtp'),
  // Comma-separated order. Failover only happens for network/5xx failures;
  // quota, authentication and sender-validation errors never fall through.
  MAIL_PROVIDER_ORDER: Joi.string()
    .pattern(/^[a-z0-9]+(?:,[a-z0-9]+)*$/i)
    .optional()
    .allow(''),
  MAIL_FAILOVER_ON_TRANSIENT: Joi.boolean().truthy('true').falsy('false').default(true),
  MAIL_PROVIDER_TIMEOUT_MS: Joi.number().integer().min(1000).max(30000).default(8000),
  MAIL_PROVIDER_FAILURE_THRESHOLD: Joi.number().integer().min(1).max(10).default(3),
  MAIL_PROVIDER_COOLDOWN_SECONDS: Joi.number().integer().min(30).max(3600).default(120),
  MAIL_FROM: Joi.string().email().required(),
  MAIL_FROM_NAME: Joi.string().max(120).optional().allow(''),
  SMTP_HOST: Joi.string().when('MAIL_DRIVER', {
    is: 'smtp',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  SMTP_PORT: Joi.number()
    .port()
    .when('MAIL_DRIVER', {
      is: 'smtp',
      then: Joi.required(),
      otherwise: Joi.optional().allow(''),
    }),
  SMTP_USER: Joi.string().optional().allow(''),
  SMTP_PASSWORD: Joi.string().optional().allow(''),
  RESEND_API_KEY: Joi.string().when('MAIL_DRIVER', {
    is: 'resend',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  BREVO_API_KEY: Joi.string().optional().allow(''),
  BREVO_API_URL: Joi.string().uri().default('https://api.brevo.com/v3/smtp/email'),
  MAILJET_API_KEY: Joi.string().optional().allow(''),
  MAILJET_API_SECRET: Joi.string().optional().allow(''),
  MAILJET_API_URL: Joi.string().uri().default('https://api.mailjet.com/v3.1/send'),
  SMTP2GO_API_KEY: Joi.string().optional().allow(''),
  SMTP2GO_API_URL: Joi.string().uri().default('https://api.smtp2go.com/v3/email/send'),
  MAILGUN_API_KEY: Joi.string().optional().allow(''),
  MAILGUN_DOMAIN: Joi.string().hostname().optional().allow(''),
  MAILGUN_API_BASE_URL: Joi.string().uri().default('https://api.mailgun.net'),

  // Image moderation
  IMAGE_MODERATION_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),

  // Sentry
  SENTRY_DSN: Joi.string().optional().allow(''),
  SENTRY_TRACES_SAMPLE_RATE: Joi.number().min(0).max(1).default(0.1),

  // Logging
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace').default('info'),
  LOG_PRETTY: Joi.boolean().truthy('true').falsy('false').default(false),

  // Rate limiting
  RATE_LIMIT_TRUST_PROXY: Joi.boolean().truthy('true').falsy('false').default(false),
});

export interface EnvVars {
  NODE_ENV: 'development' | 'test' | 'production';
  APP_PORT: number;
  APP_HOST: string;
  APP_BASE_URL: string;
  FRONTEND_ORIGIN: string;
  MERCHANT_ORIGIN: string;
  ADMIN_ORIGIN?: string;
  ALLOWED_EMAIL_DOMAIN: string;
  CHATROOM_RETENTION_DAYS: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_TTL_SECONDS: number;
  JWT_REFRESH_TTL_SECONDS: number;
  ADMIN_TOTP_SECRET?: string;
  ANON_SECRET: string;
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  S3_ENDPOINT?: string;
  S3_FORCE_PATH_STYLE: boolean;
  S3_UPLOADS_BUCKET: string;
  S3_AVATARS_BUCKET: string;
  CDN_BASE_URL: string;
  MAIL_DRIVER: 'smtp' | 'ses' | 'resend' | 'brevo' | 'mailjet' | 'smtp2go' | 'mailgun';
  MAIL_PROVIDER_ORDER?: string;
  MAIL_FAILOVER_ON_TRANSIENT: boolean;
  MAIL_PROVIDER_TIMEOUT_MS: number;
  MAIL_PROVIDER_FAILURE_THRESHOLD: number;
  MAIL_PROVIDER_COOLDOWN_SECONDS: number;
  MAIL_FROM: string;
  MAIL_FROM_NAME?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: number;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  RESEND_API_KEY?: string;
  BREVO_API_KEY?: string;
  BREVO_API_URL: string;
  MAILJET_API_KEY?: string;
  MAILJET_API_SECRET?: string;
  MAILJET_API_URL: string;
  SMTP2GO_API_KEY?: string;
  SMTP2GO_API_URL: string;
  MAILGUN_API_KEY?: string;
  MAILGUN_DOMAIN?: string;
  MAILGUN_API_BASE_URL: string;
  IMAGE_MODERATION_ENABLED: boolean;
  SENTRY_DSN?: string;
  SENTRY_TRACES_SAMPLE_RATE: number;
  LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  LOG_PRETTY: boolean;
  RATE_LIMIT_TRUST_PROXY: boolean;
}

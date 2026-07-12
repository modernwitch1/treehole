import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger as NestLogger, ValidationPipe } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { json, urlencoded, type NextFunction, type Request, type Response } from 'express';
import { AppModule } from './app.module';
import { AppConfig } from './config/app.config';
import {
  APPEAL_ACCESS_COOKIE,
  ADMIN_ACCESS_COOKIE,
  USER_ACCESS_COOKIE,
  USER_REFRESH_COOKIE,
} from './auth/session.constants';
import { RateLimitService } from './common/security/rate-limit.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  // 用 Pino 替换默认日志
  app.useLogger(app.get(PinoLogger));

  const config = app.get(AppConfig);

  // 信任反向代理 (Nginx / ALB) 提供的 X-Forwarded-For
  if (config.get('RATE_LIMIT_TRUST_PROXY')) {
    // Trust only local/private reverse proxies. A numeric hop count would also
    // trust an attacker connecting directly to an accidentally exposed API port.
    app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  }

  // 安全 / 性能中间件
  app.use(
    helmet({
      contentSecurityPolicy: config.isProduction ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());
  app.use(cookieParser());

  const corsOrigins = [config.get('FRONTEND_ORIGIN'), config.get('ADMIN_ORIGIN')]
    .filter((origin): origin is string => Boolean(origin))
    .map((origin) => new URL(origin).origin);

  // CORS — 白名单前端/后台域 + credentials
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
  });

  // Cookie-authenticated state changes must come from one of our browser origins.
  // Bearer clients remain compatible because they are not relying on ambient cookies.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      next();
      return;
    }
    const origin = req.headers.origin;
    const usesAuthCookie = Boolean(
      req.cookies?.[USER_ACCESS_COOKIE] ||
      req.cookies?.[USER_REFRESH_COOKIE] ||
      req.cookies?.[APPEAL_ACCESS_COOKIE] ||
      req.cookies?.[ADMIN_ACCESS_COOKIE],
    );
    if ((!origin && !usesAuthCookie) || (origin && corsOrigins.includes(origin))) {
      next();
      return;
    }
    res.status(403).json({ code: 'BAD_ORIGIN', message: '非法请求来源' });
  });

  // Reject oversized JSON before it reaches controllers or expensive password hashing.
  app.use(json({ limit: '64kb', strict: true }));
  app.use(urlencoded({ extended: false, limit: '32kb', parameterLimit: 100 }));

  // Registration uploads are unauthenticated, so limit them before Multer buffers the file.
  const rateLimit = app.get(RateLimitService);
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'POST' || !req.path.includes('/uploads/')) {
      next();
      return;
    }
    const isRegistration = req.path.endsWith('/uploads/registration');
    const limit = isRegistration ? 10 : 60;
    rateLimit
      .consume(
        isRegistration ? 'upload-registration-ip' : 'upload-authenticated-ip',
        req.ip ?? 'unknown',
        limit,
        3600,
        '上传过于频繁，请稍后再试',
      )
      .then(() => next())
      .catch(() => {
        res.status(429).json({ code: 'TOO_MANY_REQUESTS', message: '上传过于频繁，请稍后再试' });
      });
  });

  // 全局 API 前缀, 健康检查除外
  app.setGlobalPrefix('api/v1', {
    exclude: ['healthz', 'readyz'],
  });

  // class-validator / class-transformer 的兜底 (Zod 仍优先用 ZodValidationPipe)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // 优雅退出
  app.enableShutdownHooks();

  const port = config.get('APP_PORT');
  const host = config.get('APP_HOST');
  await app.listen(port, host);

  const log = new NestLogger('bootstrap');
  log.log(`🚀 API listening on http://${host}:${port}`);
  log.log(`🌐 allowed origins: ${corsOrigins.join(', ')}`);
  log.log(`📧 allowed email domain: @${config.get('ALLOWED_EMAIL_DOMAIN')}`);
}

bootstrap().catch((err) => {
  console.error('💥 bootstrap failed', err);
  process.exit(1);
});

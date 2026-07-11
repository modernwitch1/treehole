import { randomUUID } from 'node:crypto';
import type { Params } from 'nestjs-pino';

export interface PinoConfigInput {
  NODE_ENV: 'development' | 'test' | 'production';
  LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  LOG_PRETTY: boolean;
}

export function buildPinoConfig(env: PinoConfigInput): Params {
  const pretty = env.LOG_PRETTY && env.NODE_ENV !== 'production';

  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && /^[A-Za-z0-9._:-]{1,64}$/.test(incoming)
            ? incoming
            : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      // 屏蔽敏感字段
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-csrf-token"]',
          'req.body.password',
          'req.body.oldPassword',
          'req.body.newPassword',
          'req.body.token',
          'req.body.refreshToken',
          'res.headers["set-cookie"]',
          '*.password',
          '*.passwordHash',
          '*.token',
          '*.tokenHash',
          '*.refreshToken',
          '*.accessToken',
        ],
        remove: false,
        censor: '***',
      },
      // 业务字段额外加入日志
      customProps: (req) => ({
        userId: (req as { user?: { id?: string | number } }).user?.id,
      }),
      // 减少噪音: 健康检查不打日志
      autoLogging: {
        ignore: (req) => req.url === '/healthz' || req.url === '/readyz',
      },
      transport: pretty
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              singleLine: true,
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    },
  };
}

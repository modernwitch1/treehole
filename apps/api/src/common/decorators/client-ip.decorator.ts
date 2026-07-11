import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

/**
 * 提取客户端 IP。
 * - 信任 `X-Forwarded-For` 仅在 RATE_LIMIT_TRUST_PROXY=true 时（由 main.ts 配置 `set('trust proxy')`）。
 * - express 在 trust proxy=true 时 req.ip 已经是真实 IP。
 */
export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
});

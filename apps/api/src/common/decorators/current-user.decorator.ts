import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

/**
 * 提取登录用户。在 AuthGuard 通过后, `req.user` 由 JwtStrategy 填充。
 * Slice 2 起生效, 此处提前定义类型以便其他文件引用。
 */
export interface AuthUser {
  id: bigint;
  email: string;
  username: string;
  role: 'user' | 'moderator' | 'admin' | 'superadmin';
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
  if (!req.user) {
    throw new UnauthorizedException('Authentication required');
  }
  return req.user;
});

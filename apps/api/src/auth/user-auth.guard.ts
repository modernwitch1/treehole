import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.module';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { USER_ACCESS_COOKIE } from './session.constants';

export type UserRequest = Request & { user?: AuthUser };

@Injectable()
export class UserAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<UserRequest>();
    const token = this.extractToken(req);
    if (!token) {
      throw new UnauthorizedException('未登录');
    }

    let payload: { sub: string; email?: string; username?: string; role?: string; type?: string };
    try {
      payload = this.jwt.verify(token, {
        issuer: 'zjgsu-treehole',
        audience: 'forum-user',
      });
    } catch {
      throw new UnauthorizedException('登录已过期，请重新登录');
    }

    if (payload.type !== 'user') {
      throw new UnauthorizedException('无效登录态');
    }

    const user = await this.prisma.user.findUnique({ where: { id: BigInt(payload.sub) } });
    if (!user || user.deletedAt || user.status === 'banned') {
      throw new UnauthorizedException('账号不可用');
    }

    req.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    };
    return true;
  }

  private extractToken(req: Request): string | null {
    const cookieToken = req.cookies?.[USER_ACCESS_COOKIE] as string | undefined;
    if (cookieToken) {
      return cookieToken;
    }

    const header = req.headers.authorization;
    if (!header) {
      return null;
    }
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return null;
    }
    return token;
  }
}

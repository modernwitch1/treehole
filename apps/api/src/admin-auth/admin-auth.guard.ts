import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AdminAuthService, isAdminRole, type AdminPrincipal } from './admin-auth.service';
import { ADMIN_ACCESS_COOKIE } from '../auth/session.constants';

export type AdminRequest = Request & { admin?: AdminPrincipal };

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly auth: AdminAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AdminRequest>();
    const token = this.extractToken(req);
    if (!token) {
      throw new UnauthorizedException('未登录');
    }

    const admin = await this.auth.validateToken(token);
    if (!isAdminRole(admin.role)) {
      throw new UnauthorizedException('无后台权限');
    }
    req.admin = admin;
    return true;
  }

  private extractToken(req: Request): string | null {
    const cookieToken = req.cookies?.[ADMIN_ACCESS_COOKIE] as string | undefined;
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

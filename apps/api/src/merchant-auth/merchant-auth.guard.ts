import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.module';
import { MERCHANT_ACCESS_COOKIE } from './session.constants';

export interface MerchantPrincipal {
  id: bigint;
  email: string;
  displayName: string;
  isPlatformAdmin: boolean;
}

export type MerchantRequest = Request & { merchant?: MerchantPrincipal };

@Injectable()
export class MerchantAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<MerchantRequest>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('商家后台未登录');
    }

    let payload: { sub?: string; type?: string };
    try {
      payload = this.jwt.verify(token, {
        issuer: 'zjgsu-treehole',
        audience: 'merchant-portal',
      });
    } catch {
      throw new UnauthorizedException('商家后台登录已过期');
    }

    if (payload.type !== 'merchant' || !payload.sub) {
      throw new UnauthorizedException('无效的商家后台登录态');
    }

    let accountId: bigint;
    try {
      accountId = BigInt(payload.sub);
    } catch {
      throw new UnauthorizedException('无效的商家后台账号');
    }

    const account = await this.prisma.foodStaffAccount.findFirst({
      where: {
        id: accountId,
        status: 'active',
        OR: [
          {
            isPlatformAdmin: true,
            forumUser: { role: 'superadmin', status: 'active', deletedAt: null },
          },
          {
            isPlatformAdmin: false,
            memberships: { some: { status: 'active', merchant: { status: 'active' } } },
          },
        ],
      },
      select: { id: true, email: true, displayName: true, isPlatformAdmin: true },
    });
    if (!account) {
      throw new UnauthorizedException('商家后台账号已停用');
    }

    request.merchant = account;
    return true;
  }

  private extractToken(request: Request) {
    const cookie = request.cookies?.[MERCHANT_ACCESS_COOKIE] as string | undefined;
    if (cookie) {
      return cookie;
    }
    const authorization = request.headers.authorization;
    if (!authorization) {
      return null;
    }
    const [scheme, token] = authorization.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : null;
  }
}

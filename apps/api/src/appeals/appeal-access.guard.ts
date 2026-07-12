import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.module';
import { RedisService } from '../redis/redis.module';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { APPEAL_ACCESS_COOKIE, USER_ACCESS_COOKIE } from '../auth/session.constants';

type AppealRequest = Request & { user?: AuthUser };

@Injectable()
export class AppealAccessGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppealRequest>();
    const candidates = [
      request.cookies?.[USER_ACCESS_COOKIE] as string | undefined,
      request.cookies?.[APPEAL_ACCESS_COOKIE] as string | undefined,
      this.bearerToken(request),
    ].filter((token): token is string => Boolean(token));

    let subject: string | null = null;
    for (const token of candidates) {
      subject = await this.verifySubject(token);
      if (subject) {
        break;
      }
    }
    if (!subject) {
      throw new UnauthorizedException('申诉登录已过期，请重新登录');
    }

    let userId: bigint;
    try {
      userId = BigInt(subject);
    } catch {
      throw new UnauthorizedException('无效登录态');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('账号不存在');
    }

    request.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    };
    return true;
  }

  private async verifySubject(token: string): Promise<string | null> {
    for (const candidate of [
      { audience: 'forum-user', type: 'user' },
      { audience: 'forum-appeal', type: 'appeal' },
    ] as const) {
      try {
        const payload = this.jwt.verify<{ sub?: string; type?: string; jti?: string }>(token, {
          issuer: 'zjgsu-treehole',
          audience: candidate.audience,
        });
        if (payload.type !== candidate.type || !payload.sub) {
          continue;
        }
        if (candidate.type === 'appeal') {
          if (!payload.jti) {
            continue;
          }
          const sessionUserId = await this.redis.client.get(`appeal-session:${payload.jti}`);
          if (sessionUserId !== payload.sub) {
            continue;
          }
        }
        return payload.sub;
      } catch {
        // Try the next narrowly scoped audience.
      }
    }
    return null;
  }

  private bearerToken(request: Request) {
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    return scheme?.toLowerCase() === 'bearer' ? token : undefined;
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AppConfig } from '../config/app.config';
import { PrismaService } from '../prisma/prisma.module';
import type { AcceptMerchantInvitationDto, MerchantLoginDto } from './merchant-auth.dto';

export interface MerchantSessionTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class MerchantAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly jwt: JwtService,
  ) {}

  async login(data: MerchantLoginDto, ip?: string, userAgent?: string) {
    const identifier = data.email.trim();
    const email = identifier.toLowerCase();
    const { verify } = await import('argon2');
    let account = await this.prisma.foodStaffAccount.findUnique({
      where: { email },
      include: { forumUser: true },
    });

    if (account) {
      if (account.status !== 'active') {
        throw new UnauthorizedException('商家邮箱或密码错误');
      }
      if (account.isPlatformAdmin) {
        if (!this.isActiveSuperadmin(account.forumUser)) {
          throw new UnauthorizedException('商家后台账号已停用');
        }
        if (!(await verify(account.forumUser.passwordHash, data.password))) {
          throw new UnauthorizedException('商家邮箱或密码错误');
        }
        if (account.passwordHash !== account.forumUser.passwordHash) {
          account = await this.prisma.foodStaffAccount.update({
            where: { id: account.id },
            data: { passwordHash: account.forumUser.passwordHash },
            include: { forumUser: true },
          });
        }
      } else if (!(await verify(account.passwordHash, data.password))) {
        throw new UnauthorizedException('商家邮箱或密码错误');
      }
    } else {
      const superadmin = await this.prisma.user.findFirst({
        where: {
          OR: [{ email }, { username: identifier }],
          role: 'superadmin',
          status: 'active',
          deletedAt: null,
        },
      });
      if (!superadmin || !(await verify(superadmin.passwordHash, data.password))) {
        throw new UnauthorizedException('商家邮箱或密码错误');
      }
      account = await this.ensurePlatformAccount(superadmin);
    }
    if (!account) {
      throw new UnauthorizedException('商家邮箱或密码错误');
    }
    await this.assertActiveMembership(account.id);
    await this.prisma.foodStaffAccount.update({
      where: { id: account.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ip && ip !== 'unknown' ? ip : undefined,
      },
    });
    return {
      status: 'approved' as const,
      account: this.serializeAccount(account),
      tokens: await this.createSession(account.id, ip, userAgent),
    };
  }

  async acceptInvitation(data: AcceptMerchantInvitationDto, ip?: string, userAgent?: string) {
    const tokenHash = this.hashToken(data.token);
    const invitation = await this.prisma.foodMerchantPortalInvitation.findUnique({
      where: { tokenHash },
      include: { merchant: { select: { id: true, slug: true, name: true, status: true } } },
    });
    if (!invitation || invitation.status !== 'pending') {
      throw new BadRequestException('邀请无效或已使用');
    }
    if (invitation.expiresAt <= new Date()) {
      await this.prisma.foodMerchantPortalInvitation.update({
        where: { id: invitation.id },
        data: { status: 'expired' },
      });
      throw new BadRequestException('邀请已过期');
    }
    if (invitation.merchant.status !== 'active') {
      throw new BadRequestException('商家当前不可用');
    }
    const existing = await this.prisma.foodStaffAccount.findUnique({
      where: { email: invitation.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('该邮箱已经有商家后台账号');
    }
    const { hash } = await import('argon2');
    const now = new Date();
    const passwordHash = await hash(data.password);
    const account = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.foodMerchantPortalInvitation.updateMany({
        where: { id: invitation.id, status: 'pending', expiresAt: { gt: now } },
        data: { status: 'accepted', acceptedAt: now },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('邀请已被其他人使用');
      }
      const created = await tx.foodStaffAccount.create({
        data: {
          email: invitation.email,
          displayName: data.displayName.trim(),
          passwordHash,
          status: 'active',
        },
      });
      await tx.foodMerchantPortalStaff.create({
        data: {
          merchantId: invitation.merchantId,
          accountId: created.id,
          role: invitation.role,
          status: 'active',
        },
      });
      await tx.foodMerchantPortalInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAccountId: created.id },
      });
      return created;
    });
    return {
      status: 'approved' as const,
      account: this.serializeAccount(account),
      merchant: {
        id: String(invitation.merchant.id),
        slug: invitation.merchant.slug,
        name: invitation.merchant.name,
      },
      tokens: await this.createSession(account.id, ip, userAgent),
    };
  }

  async refresh(refreshToken: string | undefined, ip?: string, userAgent?: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('商家后台未登录');
    }
    const existing = await this.prisma.foodMerchantSession.findUnique({
      where: { tokenHash: this.hashToken(refreshToken) },
      include: { account: true },
    });
    if (!existing || existing.expiresAt <= new Date() || existing.revokedAt) {
      throw new UnauthorizedException('商家后台登录已过期');
    }
    if (existing.account.status !== 'active') {
      throw new UnauthorizedException('商家后台账号已停用');
    }
    await this.assertActiveMembership(existing.account.id);
    const nextRefreshToken = this.createOpaqueToken();
    const refreshExpiresAt = new Date(
      Date.now() + this.config.get('JWT_REFRESH_TTL_SECONDS') * 1000,
    );
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.foodMerchantSession.updateMany({
        where: { id: existing.id, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { revokedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new UnauthorizedException('商家后台登录已过期');
      }
      await tx.foodMerchantSession.create({
        data: {
          accountId: existing.account.id,
          tokenHash: this.hashToken(nextRefreshToken),
          familyId: existing.familyId,
          parentId: existing.id,
          userAgent: userAgent?.slice(0, 512),
          ip: ip && ip !== 'unknown' ? ip : undefined,
          expiresAt: refreshExpiresAt,
        },
      });
    });
    return {
      accessToken: this.createAccessToken(existing.account.id, existing.account.email),
      refreshToken: nextRefreshToken,
      refreshExpiresAt,
    };
  }

  async logout(refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.foodMerchantSession.updateMany({
        where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { ok: true };
  }

  async revokeAccountSessions(accountId: bigint) {
    await this.prisma.foodMerchantSession.updateMany({
      where: { accountId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async createSession(accountId: bigint, ip?: string, userAgent?: string) {
    const refreshToken = this.createOpaqueToken();
    const refreshExpiresAt = new Date(
      Date.now() + this.config.get('JWT_REFRESH_TTL_SECONDS') * 1000,
    );
    await this.prisma.foodMerchantSession.create({
      data: {
        accountId,
        tokenHash: this.hashToken(refreshToken),
        familyId: randomUUID(),
        userAgent: userAgent?.slice(0, 512),
        ip: ip && ip !== 'unknown' ? ip : undefined,
        expiresAt: refreshExpiresAt,
      },
    });
    const account = await this.prisma.foodStaffAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    return {
      accessToken: this.createAccessToken(account.id, account.email),
      refreshToken,
      refreshExpiresAt,
    };
  }

  private createAccessToken(accountId: bigint, email: string) {
    return this.jwt.sign(
      { sub: String(accountId), email, type: 'merchant' },
      {
        expiresIn: this.config.get('JWT_ACCESS_TTL_SECONDS'),
        issuer: 'zjgsu-treehole',
        audience: 'merchant-portal',
      },
    );
  }

  private async assertActiveMembership(accountId: bigint) {
    const account = await this.prisma.foodStaffAccount.findUnique({
      where: { id: accountId },
      select: {
        isPlatformAdmin: true,
        forumUser: { select: { role: true, status: true, deletedAt: true } },
        memberships: {
          where: { status: 'active', merchant: { status: 'active' } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!account) {
      throw new UnauthorizedException('商家后台账号没有有效店铺权限');
    }
    if (account.isPlatformAdmin) {
      if (!this.isActiveSuperadmin(account.forumUser)) {
        throw new UnauthorizedException('商家后台账号已停用');
      }
      return;
    }
    if (account.memberships.length === 0) {
      throw new UnauthorizedException('商家后台账号没有有效店铺权限');
    }
  }

  private async ensurePlatformAccount(user: {
    id: bigint;
    email: string;
    username: string;
    passwordHash: string;
  }) {
    const existing = await this.prisma.foodStaffAccount.findUnique({
      where: { email: user.email },
      select: { id: true, userId: true },
    });
    if (existing?.userId && existing.userId !== user.id) {
      throw new ConflictException('该邮箱已绑定其他商家后台账号');
    }
    return this.prisma.foodStaffAccount.upsert({
      where: { email: user.email },
      create: {
        email: user.email,
        displayName: user.username,
        passwordHash: user.passwordHash,
        status: 'active',
        userId: user.id,
        isPlatformAdmin: true,
      },
      update: {
        displayName: user.username,
        passwordHash: user.passwordHash,
        status: 'active',
        userId: user.id,
        isPlatformAdmin: true,
      },
      include: { forumUser: true },
    });
  }

  private isActiveSuperadmin(
    user: { role: string; status: string; deletedAt: Date | null } | null,
  ): user is { role: string; status: string; deletedAt: Date | null } {
    return Boolean(
      user && user.role === 'superadmin' && user.status === 'active' && !user.deletedAt,
    );
  }

  private serializeAccount(account: {
    id: bigint;
    email: string;
    displayName: string;
    isPlatformAdmin?: boolean;
  }) {
    return {
      id: String(account.id),
      email: account.email,
      displayName: account.displayName,
      isPlatformAdmin: Boolean(account.isPlatformAdmin),
    };
  }

  private createOpaqueToken() {
    return randomBytes(48).toString('base64url');
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}

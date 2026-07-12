import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomInt, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.module';
import { AppConfig } from '../config/app.config';
import { RedisService } from '../redis/redis.module';
import { MailService } from './mail.service';
import { RateLimitService } from '../common/security/rate-limit.service';
import { COMMUNITY_RULES_VERSION } from '../common/community-safety.constants';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly mail: MailService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async register(
    data: {
      studentId: string;
      email?: string;
      password: string;
      username?: string;
      realName?: string;
      method: 'email' | 'screenshot';
      screenshotUrl?: string;
      acceptTerms: boolean;
      acceptCommunityRules: boolean;
      policyVersion: string;
    },
    ip = 'unknown',
    userAgent?: string,
  ) {
    const studentId = data.studentId.trim();
    const email =
      data.method === 'email'
        ? data.email?.trim().toLowerCase()
        : `${studentId}@${this.config.get('ALLOWED_EMAIL_DOMAIN')}`;
    const realName = data.realName?.trim();

    await this.rateLimit.consume('register-ip', ip, 5, 3600);

    if (!data.acceptTerms || !data.acceptCommunityRules) {
      throw new BadRequestException('请先阅读并同意用户协议、隐私政策和社区规则');
    }
    if (data.policyVersion !== COMMUNITY_RULES_VERSION) {
      throw new BadRequestException('社区规则已更新，请刷新页面后重新阅读');
    }

    if (!studentId) {
      throw new BadRequestException('请填写学号');
    }
    if (!email) {
      throw new BadRequestException('请填写校园邮箱');
    }
    if (data.method === 'email' && !email.endsWith(`@${this.config.get('ALLOWED_EMAIL_DOMAIN')}`)) {
      throw new BadRequestException('请使用校园邮箱注册');
    }
    if (data.method === 'screenshot' && !realName) {
      throw new BadRequestException('请填写姓名');
    }
    if (data.password.length < 8 || data.password.length > 128) {
      throw new BadRequestException('密码长度必须在 8 到 128 位之间');
    }
    if (
      data.method === 'screenshot' &&
      !this.isTrustedUploadUrl(data.screenshotUrl, 'registrations')
    ) {
      throw new BadRequestException('请上传有效的校园凭证截图');
    }

    const username = await this.generateUniqueUsername();

    const bannedEmail = await this.prisma.bannedEmail.findUnique({ where: { email } });
    if (bannedEmail) {
      throw new ConflictException('该邮箱已被封禁，不能注册');
    }

    const existing = await this.prisma.registrationRequest.findUnique({
      where: { studentId },
    });
    if (existing && existing.status === 'pending') {
      throw new ConflictException('该学号已有待审批的注册申请');
    }

    const { hash } = await import('argon2');
    const passwordHash = await hash(data.password);
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);

    const verificationCode = data.method === 'email' ? String(randomInt(100000, 1_000_000)) : null;

    const request = await this.prisma.registrationRequest.create({
      data: {
        studentId,
        email,
        passwordHash,
        username,
        realName,
        method: data.method,
        screenshotUrl: data.screenshotUrl,
        verificationCode,
        policyVersion: COMMUNITY_RULES_VERSION,
        policyAcceptedAt: new Date(),
        policyAcceptedIp: ip === 'unknown' ? null : ip,
        policyAcceptedUserAgent: userAgent?.slice(0, 512),
        status: 'pending',
        expiresAt,
      },
    });

    if (data.method === 'email') {
      try {
        await this.mail.sendVerificationCode(email, verificationCode ?? '');
        this.logger.log(`Verification code sent for registration ${request.id}`);
      } catch (error) {
        await this.prisma.registrationRequest.delete({ where: { id: request.id } });
        this.logger.error(`Failed to send verification code for registration ${request.id}`, error);
        throw new BadRequestException('验证码邮件发送失败,请稍后重试');
      }
    }

    return {
      id: String(request.id),
      studentId: request.studentId,
      email: request.email,
      username: request.username,
      realName: request.realName,
      method: request.method,
      status: request.status.toLowerCase(),
      createdAt: request.createdAt.toISOString(),
      expiresAt: request.expiresAt.toISOString(),
    };
  }

  async verifyEmailCode(studentId: string, code: string, ip = 'unknown', userAgent?: string) {
    const normalizedStudentId = studentId.trim();
    await Promise.all([
      this.rateLimit.consume('verify-email-ip', ip, 30, 15 * 60),
      this.rateLimit.consume(
        'verify-email-account',
        normalizedStudentId.toLowerCase(),
        10,
        15 * 60,
      ),
    ]);
    const request = await this.prisma.registrationRequest.findUnique({
      where: { studentId: normalizedStudentId },
    });
    if (!request) {
      throw new BadRequestException('未找到注册记录');
    }
    if (request.status !== 'pending') {
      throw new BadRequestException('该申请已处理');
    }
    if (request.expiresAt <= new Date()) {
      await this.prisma.registrationRequest.update({
        where: { id: request.id },
        data: { status: 'expired' },
      });
      throw new BadRequestException('验证码已过期，请重新注册');
    }
    if (request.verificationCode !== code) {
      return { ok: false, message: '验证码错误' };
    }

    await this.activateUser(request, ip, userAgent);
    return { ok: true };
  }

  async checkRegistration(studentId: string, password: string, ip = 'unknown') {
    const normalizedStudentId = studentId.trim();
    await Promise.all([
      this.rateLimit.consume('check-registration-ip', ip, 30, 15 * 60),
      this.rateLimit.consume(
        'check-registration-account',
        normalizedStudentId.toLowerCase(),
        12,
        15 * 60,
      ),
    ]);
    const request = await this.prisma.registrationRequest.findUnique({
      where: { studentId: normalizedStudentId },
    });

    if (!request) {
      return { status: 'not_registered', message: '该学号尚未注册' };
    }

    const approvedUser =
      request.status === 'approved'
        ? await this.prisma.user.findFirst({
            where: { OR: [{ email: request.email }, { username: request.username }] },
          })
        : null;
    if (request.status === 'approved' && (!approvedUser || approvedUser.deletedAt)) {
      throw new UnauthorizedException('账号不存在或不可用');
    }
    const credentialHash = approvedUser?.passwordHash ?? request.passwordHash;
    if (!credentialHash) {
      throw new UnauthorizedException('注册凭据已失效，请重新注册');
    }
    const { verify } = await import('argon2');
    const passwordValid = await verify(credentialHash, password);
    if (!passwordValid) {
      throw new UnauthorizedException('学号或密码错误');
    }

    if (request.expiresAt < new Date() && request.status === 'pending') {
      await this.prisma.registrationRequest.update({
        where: { id: request.id },
        data: { status: 'expired' },
      });
      return { status: 'expired', message: '注册申请已过期,请重新提交' };
    }

    if (request.status === 'approved') {
      if (approvedUser?.status === 'banned') {
        throw new UnauthorizedException('账号已被封禁');
      }
    }

    return {
      status: request.status.toLowerCase(),
      request: {
        id: String(request.id),
        studentId: request.studentId,
        email: request.email,
        username: request.username,
        method: request.method,
        status: request.status.toLowerCase(),
        reviewNote: request.reviewNote,
        createdAt: request.createdAt.toISOString(),
        expiresAt: request.expiresAt.toISOString(),
      },
    };
  }

  async login(studentId: string, password: string, ip?: string, userAgent?: string) {
    const normalizedStudentId = studentId.trim();
    await Promise.all([
      this.rateLimit.consume('login-ip', ip ?? 'unknown', 40, 15 * 60),
      this.rateLimit.consume('login-account', normalizedStudentId.toLowerCase(), 12, 15 * 60),
    ]);
    const request = await this.prisma.registrationRequest.findUnique({
      where: { studentId: normalizedStudentId },
    });

    if (!request) {
      return { status: 'not_registered', message: '该学号尚未注册' };
    }

    const approvedUser =
      request.status === 'approved'
        ? await this.prisma.user.findFirst({
            where: { OR: [{ email: request.email }, { username: request.username }] },
          })
        : null;
    if (request.status === 'approved' && (!approvedUser || approvedUser.deletedAt)) {
      throw new UnauthorizedException('账号不存在或不可用');
    }
    const credentialHash = approvedUser?.passwordHash ?? request.passwordHash;
    if (!credentialHash) {
      throw new UnauthorizedException('注册凭据已失效，请重新注册');
    }
    const { verify } = await import('argon2');
    const passwordValid = await verify(credentialHash, password);
    if (!passwordValid) {
      throw new UnauthorizedException('学号或密码错误');
    }

    if (request.expiresAt < new Date() && request.status === 'pending') {
      await this.prisma.registrationRequest.update({
        where: { id: request.id },
        data: { status: 'expired' },
      });
      return { status: 'expired', message: '注册申请已过期,请重新提交' };
    }

    if (request.status !== 'approved') {
      return {
        status: request.status.toLowerCase(),
        request: this.toRegistrationDto(request),
      };
    }

    if (!approvedUser) {
      throw new UnauthorizedException('账号不存在或不可用');
    }
    const user = approvedUser;
    if (user.status === 'banned') {
      const appealSessionId = randomUUID();
      await this.redis.client.set(
        `appeal-session:${appealSessionId}`,
        String(user.id),
        'EX',
        30 * 60,
      );
      return {
        status: 'banned' as const,
        message: '账号已被封禁，你仍可查看处罚记录并提交申诉',
        appealToken: this.jwt.sign(
          { sub: String(user.id), type: 'appeal', jti: appealSessionId },
          {
            expiresIn: '30m',
            issuer: 'zjgsu-treehole',
            audience: 'forum-appeal',
          },
        ),
      };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ip && ip !== 'unknown' ? ip : undefined,
      },
    });

    return {
      status: 'approved',
      user: {
        id: String(user.id),
        username: user.username,
        email: user.email,
        role: user.role,
      },
      tokens: await this.createSession(
        user.id,
        user.email,
        user.username,
        user.role,
        ip,
        userAgent,
      ),
    };
  }

  async refreshSession(refreshToken: string | undefined, ip?: string, userAgent?: string) {
    await this.rateLimit.consume('refresh-ip', ip ?? 'unknown', 60, 15 * 60);
    if (!refreshToken) {
      throw new UnauthorizedException('未登录');
    }
    const tokenHash = this.hashToken(refreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!existing || existing.expiresAt <= new Date()) {
      throw new UnauthorizedException('登录已过期，请重新登录');
    }
    if (existing.revokedAt) {
      // A rotated token was replayed. Revoke the whole family so a stolen child
      // token cannot keep extending the compromised session.
      await this.prisma.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('登录已过期，请重新登录');
    }
    if (existing.user.status === 'banned' || existing.user.deletedAt) {
      throw new UnauthorizedException('账号不可用');
    }

    const rawRefreshToken = this.createOpaqueToken();
    const expiresAt = new Date(Date.now() + this.config.get('JWT_REFRESH_TTL_SECONDS') * 1000);
    try {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.refreshToken.updateMany({
          where: { id: existing.id, revokedAt: null, expiresAt: { gt: new Date() } },
          data: { revokedAt: new Date() },
        });
        if (claimed.count !== 1) {
          throw new UnauthorizedException('登录已过期，请重新登录');
        }
        await tx.refreshToken.create({
          data: {
            userId: existing.user.id,
            tokenHash: this.hashToken(rawRefreshToken),
            familyId: existing.familyId,
            parentId: existing.id,
            userAgent: this.truncate(userAgent, 512),
            ip: ip && ip !== 'unknown' ? ip : undefined,
            expiresAt,
          },
        });
      });
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await this.prisma.refreshToken.updateMany({
          where: { familyId: existing.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      throw error;
    }

    return {
      accessToken: this.createAccessToken(
        existing.user.id,
        existing.user.email,
        existing.user.username,
        existing.user.role,
      ),
      refreshToken: rawRefreshToken,
      refreshExpiresAt: expiresAt,
    };
  }

  async logout(refreshToken: string | undefined) {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { ok: true };
  }

  async requestPasswordReset(email: string, ip = 'unknown') {
    const normalizedEmail = email.trim().toLowerCase();
    await Promise.all([
      this.rateLimit.consume('password-reset-ip', ip, 10, 3600),
      this.rateLimit.consume('password-reset-account', normalizedEmail, 3, 3600),
    ]);
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || user.status === 'banned' || user.deletedAt) {
      return { ok: true };
    }

    const token = this.createOpaqueToken();
    const tokenHash = this.hashToken(token);
    await this.redis.client.set(`password-reset:${tokenHash}`, String(user.id), 'EX', 3600);

    const baseUrl = this.config.get('FRONTEND_ORIGIN');
    const resetUrl = `${baseUrl}/forgot-password?token=${token}`;

    try {
      await this.mail.sendPasswordResetLink(user.email, resetUrl);
      this.logger.log(`Password reset email sent for user ${user.id}`);
    } catch (error) {
      this.logger.error(`Failed to send password reset email for user ${user.id}`, error);
    }

    return { ok: true };
  }

  async resetPassword(token: string, newPassword: string, ip = 'unknown') {
    await this.rateLimit.consume('password-reset-confirm-ip', ip, 10, 3600);
    if (!token || newPassword.length < 8 || newPassword.length > 128) {
      throw new BadRequestException('密码长度必须在 8 到 128 位之间');
    }

    const tokenHash = this.hashToken(token);
    const redisKey = `password-reset:${tokenHash}`;
    const userIdStr = (await this.redis.client.eval(
      `local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value`,
      1,
      redisKey,
    )) as string | null;
    if (!userIdStr) {
      throw new BadRequestException('重置链接已过期或无效');
    }

    const { hash } = await import('argon2');
    const passwordHash = await hash(newPassword);

    const userId = BigInt(userIdStr);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    this.logger.log(`Password reset completed for user ${userIdStr}`);
    return { ok: true };
  }

  private async activateUser(
    request: {
      id: bigint;
      email: string;
      username: string;
      passwordHash: string | null;
      policyVersion: string | null;
      policyAcceptedAt: Date | null;
      policyAcceptedIp: string | null;
      policyAcceptedUserAgent: string | null;
    },
    ip = 'unknown',
    userAgent?: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      if (!request.passwordHash) {
        throw new BadRequestException('注册凭据已失效，请重新注册');
      }
      const bannedEmail = await tx.bannedEmail.findUnique({ where: { email: request.email } });
      if (bannedEmail) {
        throw new BadRequestException('该邮箱已被封禁，不能激活账号');
      }
      const claimed = await tx.registrationRequest.updateMany({
        where: { id: request.id, status: 'pending', expiresAt: { gt: new Date() } },
        data: { status: 'approved', reviewedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('该申请已处理或已过期');
      }
      const user = await tx.user.create({
        data: {
          email: request.email,
          username: request.username,
          passwordHash: request.passwordHash,
          avatarUrl: '/avatar.jpeg',
          emailVerifiedAt: new Date(),
          role: 'user',
          status: 'active',
          termsAcceptedAt: request.policyAcceptedAt ?? new Date(),
        },
      });
      await tx.policyAcceptance.create({
        data: {
          userId: user.id,
          policyVersion: request.policyVersion ?? COMMUNITY_RULES_VERSION,
          source: 'registration',
          ip: request.policyAcceptedIp ?? (ip === 'unknown' ? null : ip),
          userAgent: (request.policyAcceptedUserAgent ?? userAgent)?.slice(0, 512),
          createdAt: request.policyAcceptedAt ?? new Date(),
        },
      });
      await tx.registrationRequest.update({
        where: { id: request.id },
        data: {
          passwordHash: null,
          verificationCode: null,
          credentialsPurgedAt: new Date(),
        },
      });
    });
  }

  private async generateUniqueUsername() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const suffix = randomBytes(6)
        .toString('base64url')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 6)
        .toUpperCase();
      const username = `浙小商${suffix}`;
      const [user, request] = await Promise.all([
        this.prisma.user.findUnique({ where: { username } }),
        this.prisma.registrationRequest.findFirst({ where: { username } }),
      ]);
      if (!user && !request) {
        return username;
      }
    }
    throw new BadRequestException('用户名生成失败，请重试');
  }

  private async createSession(
    userId: bigint,
    email: string,
    username: string,
    role: 'user' | 'moderator' | 'admin' | 'superadmin',
    ip?: string,
    userAgent?: string,
  ) {
    const refreshToken = this.createOpaqueToken();
    const refreshExpiresAt = new Date(
      Date.now() + this.config.get('JWT_REFRESH_TTL_SECONDS') * 1000,
    );
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        familyId: randomUUID(),
        userAgent: this.truncate(userAgent, 512),
        ip: ip && ip !== 'unknown' ? ip : undefined,
        expiresAt: refreshExpiresAt,
      },
    });

    return {
      accessToken: this.createAccessToken(userId, email, username, role),
      refreshToken,
      refreshExpiresAt,
    };
  }

  private createAccessToken(
    userId: bigint,
    email: string,
    username: string,
    role: 'user' | 'moderator' | 'admin' | 'superadmin',
  ) {
    return this.jwt.sign(
      {
        sub: String(userId),
        email,
        username,
        role,
        type: 'user',
      },
      {
        expiresIn: this.config.get('JWT_ACCESS_TTL_SECONDS'),
        issuer: 'zjgsu-treehole',
        audience: 'forum-user',
      },
    );
  }

  private createOpaqueToken() {
    return randomBytes(48).toString('base64url');
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private toRegistrationDto(request: {
    id: bigint;
    studentId: string;
    email: string;
    username: string;
    realName: string | null;
    screenshotUrl: string | null;
    method: string;
    status: { toLowerCase(): string };
    reviewNote: string | null;
    createdAt: Date;
    expiresAt: Date;
  }) {
    return {
      id: String(request.id),
      studentId: request.studentId,
      email: request.email,
      username: request.username,
      realName: request.realName,
      screenshotUrl: request.screenshotUrl,
      method: request.method,
      status: request.status.toLowerCase(),
      reviewNote: request.reviewNote,
      createdAt: request.createdAt.toISOString(),
      expiresAt: request.expiresAt.toISOString(),
    };
  }

  private isTrustedUploadUrl(value: string | undefined, folder: 'registrations'): boolean {
    if (!value) {
      return false;
    }
    try {
      const base = new URL(`${this.config.get('CDN_BASE_URL').replace(/\/+$/, '')}/`);
      const url = new URL(value);
      const expectedPrefix = `${base.pathname}${folder}/`.replace(/\/+/g, '/');
      return (
        url.protocol === base.protocol &&
        url.host === base.host &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname.startsWith(expectedPrefix)
      );
    } catch {
      return false;
    }
  }

  private truncate(value: string | undefined, max: number): string | undefined {
    return value ? value.slice(0, max) : undefined;
  }
}

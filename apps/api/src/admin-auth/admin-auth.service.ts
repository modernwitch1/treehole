import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from 'crypto';
import { PrismaService } from '../prisma/prisma.module';
import { RedisService } from '../redis/redis.module';
import { AppConfig } from '../config/app.config';
import { RateLimitService } from '../common/security/rate-limit.service';

export type AdminRole = 'superadmin' | 'admin' | 'moderator';

export interface AdminPrincipal {
  id: string;
  username: string;
  role: AdminRole;
}

export function isAdminRole(role: string): role is AdminRole {
  return role === 'superadmin' || role === 'admin' || role === 'moderator';
}

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: AppConfig,
    private readonly rateLimit: RateLimitService,
  ) {}

  async login(
    username: string,
    password: string,
    totpCode?: string,
    ip?: string,
    userAgent?: string,
  ) {
    const normalizedUsername = username.trim();
    await Promise.all([
      this.rateLimit.consume('admin-login-ip', ip ?? 'unknown', 20, 15 * 60),
      this.rateLimit.consume('admin-login-account', normalizedUsername.toLowerCase(), 10, 15 * 60),
    ]);
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: normalizedUsername }, { email: normalizedUsername.toLowerCase() }],
        role: { in: ['superadmin', 'admin', 'moderator'] },
        status: 'active',
        deletedAt: null,
      },
    });
    if (!user) {
      throw new UnauthorizedException('管理员账号或密码错误');
    }

    const { verify } = await import('argon2');
    const passwordValid = await verify(user.passwordHash, password);
    if (!passwordValid) {
      await this.securityAudit('admin.login.failed', user.id, ip, userAgent, {
        reason: 'invalid_credentials',
      });
      throw new UnauthorizedException('管理员账号或密码错误');
    }

    // Check if 2FA is enabled
    const totpSecret = await this.getTotpSecret(String(user.id));
    if (totpSecret) {
      // 2FA is enabled, require TOTP code
      if (!totpCode) {
        await this.securityAudit('admin.login.failed', user.id, ip, userAgent, {
          reason: 'totp_required',
        });
        throw new UnauthorizedException('请输入验证码');
      }
      const counter = this.findTotpCounter(totpSecret, totpCode);
      if (counter === null) {
        await this.securityAudit('admin.login.failed', user.id, ip, userAgent, {
          reason: 'invalid_totp',
        });
        throw new UnauthorizedException('验证码错误');
      }
      const accepted = await this.redis.client.set(
        `admin-2fa-used:${user.id}:${counter}`,
        '1',
        'EX',
        90,
        'NX',
      );
      if (accepted !== 'OK') {
        await this.securityAudit('admin.login.failed', user.id, ip, userAgent, {
          reason: 'reused_totp',
        });
        throw new UnauthorizedException('验证码已使用，请等待新验证码');
      }
    }

    const jti = randomUUID();
    const payload = {
      sub: String(user.id),
      username: user.username,
      role: user.role,
      type: 'admin',
      jti,
    };
    const token = this.jwt.sign(payload, {
      expiresIn: '8h',
      issuer: 'zjgsu-treehole',
      audience: 'forum-admin',
    });
    await this.redis.client.set(`admin-session:${jti}`, String(user.id), 'EX', 8 * 3600);
    await this.securityAudit('admin.login.succeeded', user.id, ip, userAgent, { jti });
    return token;
  }

  async validateToken(token: string): Promise<AdminPrincipal> {
    try {
      const payload = this.jwt.verify<{
        sub: string;
        username: string;
        role: string;
        type?: string;
        jti?: string;
      }>(token, {
        issuer: 'zjgsu-treehole',
        audience: 'forum-admin',
      });
      if (payload.type !== 'admin') {
        throw new UnauthorizedException('无后台权限');
      }
      if (!payload.jti) {
        throw new UnauthorizedException('无效登录态');
      }
      const sessionUserId = await this.redis.client.get(`admin-session:${payload.jti}`);
      if (sessionUserId !== payload.sub) {
        throw new UnauthorizedException('登录已失效');
      }
      const user = await this.prisma.user.findUnique({ where: { id: BigInt(payload.sub) } });
      if (!user || user.deletedAt || user.status !== 'active' || !isAdminRole(user.role)) {
        throw new UnauthorizedException('无后台权限');
      }
      return { id: String(user.id), username: user.username, role: user.role };
    } catch {
      throw new UnauthorizedException('登录已过期，请重新登录');
    }
  }

  async logout(token: string | undefined, ip?: string, userAgent?: string): Promise<void> {
    if (!token) {
      return;
    }
    try {
      const payload = this.jwt.verify<{ sub?: string; jti?: string }>(token, {
        issuer: 'zjgsu-treehole',
        audience: 'forum-admin',
      });
      if (payload.jti) {
        await this.redis.client.del(`admin-session:${payload.jti}`);
      }
      if (payload.sub) {
        await this.securityAudit(
          'admin.logout',
          BigInt(payload.sub),
          ip,
          userAgent,
          payload.jti ? { jti: payload.jti } : {},
        );
      }
    } catch {
      // Logout is intentionally idempotent even for an already-expired token.
    }
  }

  /**
   * Setup 2FA: Generate a new TOTP secret and return provisioning URI
   */
  async setup2fa(userId: string, currentPassword: string, ip?: string, userAgent?: string) {
    await this.rateLimit.consume('admin-2fa-setup', userId, 5, 3600);
    const user = await this.prisma.user.findUnique({ where: { id: BigInt(userId) } });
    if (!user || user.status !== 'active' || !isAdminRole(user.role)) {
      throw new BadRequestException('用户不存在');
    }
    if (user.adminTotpSecretCiphertext) {
      throw new BadRequestException('2FA 已启用，如需更换请先使用当前验证码禁用');
    }
    const { verify } = await import('argon2');
    if (!(await verify(user.passwordHash, currentPassword))) {
      await this.securityAudit('admin.2fa.setup_failed', user.id, ip, userAgent, {
        reason: 'invalid_password',
      });
      throw new BadRequestException('当前密码错误');
    }

    // Generate a new secret (160 bits = 20 bytes)
    const secret = this.encodeBase32(randomBytes(20));

    // Store the secret in Redis with a temporary key
    const setupKey = `admin-2fa-setup:${userId}`;
    await this.redis.client.set(setupKey, this.protectSecret(secret), 'EX', 300);
    await this.securityAudit('admin.2fa.setup_started', user.id, ip, userAgent);

    // Generate provisioning URI
    const issuer = encodeURIComponent('浙工商树洞管理后台');
    const account = encodeURIComponent(user.email);
    const provisioningUri = `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

    return {
      secret,
      provisioningUri,
      // Keep the field for response compatibility without disclosing the secret
      // to a third-party QR service. The admin UI can render provisioningUri locally.
      qrCodeUrl: null,
    };
  }

  /**
   * Confirm 2FA setup: Verify the TOTP code and enable 2FA
   */
  async confirm2fa(userId: string, totpCode: string, ip?: string, userAgent?: string) {
    await this.rateLimit.consume('admin-2fa-confirm', userId, 10, 5 * 60);
    const setupKey = `admin-2fa-setup:${userId}`;
    const protectedSecret = await this.redis.client.get(setupKey);

    if (!protectedSecret) {
      throw new BadRequestException('2FA设置已过期，请重新开始');
    }
    const secret = this.unprotectSecret(protectedSecret);

    // Verify the TOTP code
    const isValid = this.verifyTotp(secret, totpCode);
    if (!isValid) {
      throw new BadRequestException('验证码错误，请重试');
    }

    await this.prisma.user.update({
      where: { id: BigInt(userId) },
      data: {
        adminTotpSecretCiphertext: this.protectSecret(secret),
        adminTotpEnabledAt: new Date(),
      },
    });

    // Remove the setup key
    await this.redis.client.del(setupKey);
    await this.securityAudit('admin.2fa.enabled', BigInt(userId), ip, userAgent);
    await this.revokeAdminSessions(userId);

    return { ok: true, message: '2FA已启用，请重新登录', requiresRelogin: true };
  }

  /**
   * Disable 2FA: Requires current TOTP code for verification
   */
  async disable2fa(userId: string, totpCode: string, ip?: string, userAgent?: string) {
    await this.rateLimit.consume('admin-2fa-disable', userId, 10, 5 * 60);
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { adminTotpSecretCiphertext: true },
    });
    if (!user?.adminTotpSecretCiphertext) {
      throw new BadRequestException('2FA未启用');
    }
    const secret = this.unprotectSecret(user.adminTotpSecretCiphertext);

    // Verify the TOTP code
    const isValid = this.verifyTotp(secret, totpCode);
    if (!isValid) {
      throw new BadRequestException('验证码错误');
    }

    // Remove the secret
    await this.prisma.user.update({
      where: { id: BigInt(userId) },
      data: { adminTotpSecretCiphertext: null, adminTotpEnabledAt: null },
    });
    await this.redis.client.del(`admin-2fa:${userId}`);
    await this.securityAudit('admin.2fa.disabled', BigInt(userId), ip, userAgent);
    await this.revokeAdminSessions(userId);

    return {
      ok: true,
      message: this.config.isProduction ? '个人2FA已移除，系统级2FA仍然有效' : '2FA已禁用',
      requiresRelogin: true,
    };
  }

  /**
   * Check if 2FA is enabled for a user
   */
  async get2faStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { adminTotpEnabledAt: true },
    });
    const systemFallback = Boolean(
      this.config.isProduction && this.config.get('ADMIN_TOTP_SECRET')?.trim(),
    );
    return {
      enabled: Boolean(user?.adminTotpEnabledAt) || systemFallback,
      personalEnabled: Boolean(user?.adminTotpEnabledAt),
      systemFallback,
    };
  }

  async verifyStepUp(userId: string, totpCode: string) {
    await this.rateLimit.consume('admin-2fa-step-up', userId, 10, 5 * 60);
    if (typeof totpCode !== 'string' || !/^\d{6}$/.test(totpCode.trim())) {
      throw new BadRequestException('请输入 6 位二次验证码');
    }
    const secret = await this.getTotpSecret(userId);
    if (!secret) {
      throw new BadRequestException('请先为管理员账号启用二次验证');
    }
    const counter = this.findTotpCounter(secret, totpCode);
    if (counter === null) {
      throw new BadRequestException('二次验证码错误');
    }
    const accepted = await this.redis.client.set(
      `admin-2fa-used:${userId}:${counter}`,
      '1',
      'EX',
      90,
      'NX',
    );
    if (accepted !== 'OK') {
      throw new BadRequestException('该验证码已使用，请等待新验证码');
    }
    return true;
  }

  private async getTotpSecret(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { adminTotpSecretCiphertext: true },
    });
    if (user?.adminTotpSecretCiphertext) {
      return this.unprotectSecret(user.adminTotpSecretCiphertext);
    }
    const totpKey = `admin-2fa:${userId}`;
    const value = await this.redis.client.get(totpKey);
    if (!value) {
      const systemSecret = this.config.get('ADMIN_TOTP_SECRET')?.trim();
      return this.config.isProduction && systemSecret ? systemSecret : null;
    }
    // Existing records may have a TTL or be plaintext. Migrate them lazily.
    const secret = this.unprotectSecret(value);
    await this.prisma.user.update({
      where: { id: BigInt(userId) },
      data: {
        adminTotpSecretCiphertext: this.protectSecret(secret),
        adminTotpEnabledAt: new Date(),
      },
    });
    await this.redis.client.del(totpKey);
    return secret;
  }

  private async securityAudit(
    action: string,
    actorId: bigint,
    ip?: string,
    userAgent?: string,
    metadata: Record<string, string> = {},
  ) {
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action,
        targetType: 'admin-session',
        ip: ip && ip !== 'unknown' ? ip : null,
        userAgent: userAgent?.slice(0, 512),
        metadata,
      },
    });
  }

  private async revokeAdminSessions(userId: string) {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.client.scan(
        cursor,
        'MATCH',
        'admin-session:*',
        'COUNT',
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        const values = await this.redis.client.mget(keys);
        const ownedKeys = keys.filter((_, index) => values[index] === userId);
        if (ownedKeys.length > 0) {
          await this.redis.client.del(...ownedKeys);
        }
      }
    } while (cursor !== '0');
  }

  private verifyTotp(secret: string, code: string): boolean {
    return this.findTotpCounter(secret, code) !== null;
  }

  private findTotpCounter(secret: string, code: string): number | null {
    const normalized = code.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(normalized)) {
      return null;
    }
    const now = Math.floor(Date.now() / 1000 / 30);
    for (const offset of [-1, 0, 1]) {
      const counter = now + offset;
      if (this.totpAt(secret, counter) === normalized) {
        return counter;
      }
    }
    return null;
  }

  private totpAt(secret: string, counter: number): string {
    const key = this.decodeBase32(secret);
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter));
    const hmac = createHmac('sha1', key).update(buffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    return String(binary % 1_000_000).padStart(6, '0');
  }

  private decodeBase32(secret: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const clean = secret.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
    let bits = '';
    for (const char of clean) {
      const value = alphabet.indexOf(char);
      if (value === -1) {
        return Buffer.from(secret, 'utf8');
      }
      bits += value.toString(2).padStart(5, '0');
    }
    const bytes = bits.match(/.{8}/g)?.map((byte) => Number.parseInt(byte, 2)) ?? [];
    return Buffer.from(bytes);
  }

  private encodeBase32(input: Buffer): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const byte of input) {
      bits += byte.toString(2).padStart(8, '0');
    }
    let output = '';
    for (let index = 0; index < bits.length; index += 5) {
      output += alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
    }
    return output;
  }

  private protectSecret(secret: string): string {
    if (secret.startsWith('v1.')) {
      return secret;
    }
    const key = this.totpEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
  }

  private unprotectSecret(value: string): string {
    if (!value.startsWith('v1.')) {
      return value;
    }
    try {
      const [, ivRaw, tagRaw, ciphertextRaw] = value.split('.');
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.totpEncryptionKey(),
        Buffer.from(ivRaw, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new UnauthorizedException('2FA密钥无法读取，请联系系统管理员');
    }
  }

  private totpEncryptionKey(): Buffer {
    const material = this.config.get('ADMIN_TOTP_SECRET') || this.config.get('JWT_ACCESS_SECRET');
    return createHash('sha256').update(material).digest();
  }
}

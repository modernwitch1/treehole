import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AdminAuthService, type AdminPrincipal } from './admin-auth.service';
import { AdminAuthGuard, type AdminRequest } from './admin-auth.guard';
import { AppConfig } from '../config/app.config';
import { ADMIN_ACCESS_COOKIE } from '../auth/session.constants';
import { AdminLoginDto, SetupTotpDto, TotpCodeDto } from './admin-auth.dto';
import { ClientIp } from '../common/decorators/client-ip.decorator';

@Controller()
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly config: AppConfig,
  ) {}

  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: AdminLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = await this.auth.login(
      body.username,
      body.password,
      body.totpCode,
      req.ip,
      req.headers['user-agent'],
    );
    res.cookie(ADMIN_ACCESS_COOKIE, token, {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 3600 * 1000,
    });
    return { ok: true };
  }

  @Post('admin/logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(this.extractToken(req), req.ip, req.headers['user-agent']);
    res.clearCookie(ADMIN_ACCESS_COOKIE, {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: 'lax',
      path: '/',
    });
    return { ok: true };
  }

  @Get('admin/me')
  @UseGuards(AdminAuthGuard)
  async me(@Req() req: AdminRequest) {
    const user = this.currentAdmin(req);
    return {
      id: user.id,
      username: user.username,
      email: `${user.username}@unidating.top`,
      avatarUrl: undefined,
      role: user.role,
    };
  }

  /**
   * Setup 2FA: Generate new TOTP secret
   */
  @Post('admin/2fa/setup')
  @UseGuards(AdminAuthGuard)
  async setup2fa(@Req() req: AdminRequest, @Body() body: SetupTotpDto, @ClientIp() ip: string) {
    const admin = this.currentAdmin(req);
    return this.auth.setup2fa(admin.id, body.currentPassword, ip, req.headers['user-agent']);
  }

  /**
   * Confirm 2FA setup: Verify TOTP code and enable 2FA
   */
  @Post('admin/2fa/confirm')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.OK)
  async confirm2fa(@Req() req: AdminRequest, @Body() body: TotpCodeDto, @ClientIp() ip: string) {
    const admin = this.currentAdmin(req);
    return this.auth.confirm2fa(admin.id, body.code, ip, req.headers['user-agent']);
  }

  /**
   * Disable 2FA: Requires current TOTP code
   */
  @Post('admin/2fa/disable')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.OK)
  async disable2fa(@Req() req: AdminRequest, @Body() body: TotpCodeDto, @ClientIp() ip: string) {
    const admin = this.currentAdmin(req);
    return this.auth.disable2fa(admin.id, body.code, ip, req.headers['user-agent']);
  }

  /**
   * Check 2FA status
   */
  @Get('admin/2fa/status')
  @UseGuards(AdminAuthGuard)
  async get2faStatus(@Req() req: AdminRequest) {
    const admin = this.currentAdmin(req);
    return this.auth.get2faStatus(admin.id);
  }

  private currentAdmin(req: AdminRequest): AdminPrincipal {
    if (!req.admin) {
      throw new UnauthorizedException('未登录');
    }
    return req.admin;
  }

  private extractToken(req: Request): string | undefined {
    const cookieToken = req.cookies?.[ADMIN_ACCESS_COOKIE] as string | undefined;
    if (cookieToken) {
      return cookieToken;
    }
    const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
    return scheme?.toLowerCase() === 'bearer' ? token : undefined;
  }
}

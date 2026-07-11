import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthGuard, type AdminRequest } from './admin-auth.guard';
import { AppConfig } from '../config/app.config';
import { ADMIN_ACCESS_COOKIE } from '../auth/session.constants';
import { AdminLoginDto, TotpCodeDto } from './admin-auth.dto';

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
    const token = await this.auth.login(body.username, body.password, body.totpCode, req.ip);
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
    await this.auth.logout(this.extractToken(req));
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
    const user = req.admin!;
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
  async setup2fa(@Req() req: AdminRequest) {
    const admin = req.admin!;
    return this.auth.setup2fa(admin.id);
  }

  /**
   * Confirm 2FA setup: Verify TOTP code and enable 2FA
   */
  @Post('admin/2fa/confirm')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.OK)
  async confirm2fa(@Req() req: AdminRequest, @Body() body: TotpCodeDto) {
    const admin = req.admin!;
    return this.auth.confirm2fa(admin.id, body.code);
  }

  /**
   * Disable 2FA: Requires current TOTP code
   */
  @Post('admin/2fa/disable')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.OK)
  async disable2fa(@Req() req: AdminRequest, @Body() body: TotpCodeDto) {
    const admin = req.admin!;
    return this.auth.disable2fa(admin.id, body.code);
  }

  /**
   * Check 2FA status
   */
  @Get('admin/2fa/status')
  @UseGuards(AdminAuthGuard)
  async get2faStatus(@Req() req: AdminRequest) {
    const admin = req.admin!;
    return this.auth.get2faStatus(admin.id);
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

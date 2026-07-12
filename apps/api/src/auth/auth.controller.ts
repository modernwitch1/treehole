import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AppConfig } from '../config/app.config';
import { APPEAL_ACCESS_COOKIE, USER_ACCESS_COOKIE, USER_REFRESH_COOKIE } from './session.constants';
import {
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  RegisterDto,
  StudentPasswordDto,
  VerifyEmailDto,
} from './auth.dto';

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  @Post('auth/register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: RegisterDto, @Req() req: Request) {
    return this.auth.register(body, req.ip, req.headers['user-agent']);
  }

  @Post('auth/verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() body: VerifyEmailDto, @Req() req: Request) {
    return this.auth.verifyEmailCode(body.studentId, body.code, req.ip, req.headers['user-agent']);
  }

  @Post('auth/check-registration')
  @HttpCode(HttpStatus.OK)
  async checkRegistration(@Body() body: StudentPasswordDto, @Req() req: Request) {
    return this.auth.checkRegistration(body.studentId, body.password, req.ip);
  }

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: StudentPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(
      body.studentId,
      body.password,
      req.ip,
      req.headers['user-agent'],
    );
    if (
      result.status === 'banned' &&
      'appealToken' in result &&
      typeof result.appealToken === 'string'
    ) {
      this.clearSessionCookies(res);
      this.setAppealCookie(res, result.appealToken);
      return { status: result.status, message: result.message };
    }
    if (result.status === 'approved' && 'tokens' in result && result.tokens) {
      this.setSessionCookies(res, result.tokens);
      this.clearAppealCookie(res);
    }
    return result;
  }

  @Post('auth/refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.refreshSession(
      req.cookies?.[USER_REFRESH_COOKIE],
      req.ip,
      req.headers['user-agent'],
    );
    this.setSessionCookies(res, tokens);
    return { ok: true };
  }

  @Post('auth/logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[USER_REFRESH_COOKIE]);
    this.clearSessionCookies(res);
    this.clearAppealCookie(res);
    return { ok: true };
  }

  @Post('auth/password-reset/request')
  @HttpCode(HttpStatus.OK)
  async requestPasswordReset(@Body() body: PasswordResetRequestDto, @Req() req: Request) {
    return this.auth.requestPasswordReset(body.email, req.ip);
  }

  @Post('auth/password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmPasswordReset(@Body() body: PasswordResetConfirmDto, @Req() req: Request) {
    return this.auth.resetPassword(body.token, body.newPassword, req.ip);
  }

  private setSessionCookies(
    res: Response,
    tokens: { accessToken: string; refreshToken: string; refreshExpiresAt: Date },
  ) {
    const secure = this.config.isProduction;
    res.cookie(USER_ACCESS_COOKIE, tokens.accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: this.config.get('JWT_ACCESS_TTL_SECONDS') * 1000,
    });
    res.cookie(USER_REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      expires: tokens.refreshExpiresAt,
    });
  }

  private clearSessionCookies(res: Response) {
    const secure = this.config.isProduction;
    const opts = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' };
    res.clearCookie(USER_ACCESS_COOKIE, opts);
    res.clearCookie(USER_REFRESH_COOKIE, opts);
  }

  private setAppealCookie(res: Response, token: string) {
    res.cookie(APPEAL_ACCESS_COOKIE, token, {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: 'lax',
      path: '/api/v1/appeals',
      maxAge: 30 * 60 * 1000,
    });
  }

  private clearAppealCookie(res: Response) {
    res.clearCookie(APPEAL_ACCESS_COOKIE, {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: 'lax',
      path: '/api/v1/appeals',
    });
  }
}

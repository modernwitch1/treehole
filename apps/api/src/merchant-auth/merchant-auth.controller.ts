import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppConfig } from '../config/app.config';
import { AcceptMerchantInvitationDto, MerchantLoginDto } from './merchant-auth.dto';
import { MerchantAuthService } from './merchant-auth.service';
import { MERCHANT_ACCESS_COOKIE, MERCHANT_REFRESH_COOKIE } from './session.constants';

@Controller('merchant/auth')
export class MerchantAuthController {
  constructor(
    private readonly auth: MerchantAuthService,
    private readonly config: AppConfig,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: MerchantLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(body, request.ip, request.headers['user-agent']);
    this.setSessionCookies(response, result.tokens);
    return { status: result.status, account: result.account };
  }

  @Post('invitations/accept')
  @HttpCode(HttpStatus.OK)
  async acceptInvitation(
    @Body() body: AcceptMerchantInvitationDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.acceptInvitation(
      body,
      request.ip,
      request.headers['user-agent'],
    );
    this.setSessionCookies(response, result.tokens);
    return { status: result.status, account: result.account, merchant: result.merchant };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const tokens = await this.auth.refresh(
      request.cookies?.[MERCHANT_REFRESH_COOKIE],
      request.ip,
      request.headers['user-agent'],
    );
    this.setSessionCookies(response, tokens);
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.cookies?.[MERCHANT_REFRESH_COOKIE]);
    this.clearSessionCookies(response);
    return { ok: true };
  }

  private setSessionCookies(
    response: Response,
    tokens: { accessToken: string; refreshToken: string; refreshExpiresAt: Date },
  ) {
    const secure = this.config.isProduction;
    response.cookie(MERCHANT_ACCESS_COOKIE, tokens.accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: this.config.get('JWT_ACCESS_TTL_SECONDS') * 1000,
    });
    response.cookie(MERCHANT_REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      expires: tokens.refreshExpiresAt,
    });
  }

  private clearSessionCookies(response: Response) {
    response.clearCookie(MERCHANT_ACCESS_COOKIE, {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: 'lax',
      path: '/',
    });
    response.clearCookie(MERCHANT_REFRESH_COOKIE, {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: 'lax',
      path: '/',
    });
  }
}

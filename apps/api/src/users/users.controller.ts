import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { UsersService } from './users.service';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { UserAuthGuard } from '../auth/user-auth.guard';
import { ClientIp } from '../common/decorators/client-ip.decorator';

@Controller('users')
@UseGuards(UserAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.getCurrentUser(user.id);
  }

  @Patch('me/dm-settings')
  setDmAllowed(@Body() body: { allowed: boolean }, @CurrentUser() user: AuthUser) {
    return this.users.setDmAllowed(user.id, body.allowed);
  }

  @Post('me/community-rules/acknowledge')
  acknowledgeCommunityRules(
    @Body()
    body: {
      version: string;
      source: 'new_user_daily' | 'publish' | 'private_message' | 'rules_update';
    },
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
    @Req() req: Request,
  ) {
    return this.users.acknowledgeCommunityRules(user.id, body, ip, req.headers['user-agent']);
  }
}

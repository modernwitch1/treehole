import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import { AppealAccessGuard } from './appeal-access.guard';
import { CreateAppealDto } from './appeals.dto';
import { AppealsService } from './appeals.service';

@Controller('appeals')
@UseGuards(AppealAccessGuard)
export class AppealsController {
  constructor(private readonly appeals: AppealsService) {}

  @Get('me/sanctions')
  listMySanctions(@CurrentUser() user: AuthUser) {
    return this.appeals.listMySanctions(user.id);
  }

  @Post()
  createAppeal(
    @Body() body: CreateAppealDto,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
    @Req() request: Request,
  ) {
    return this.appeals.createAppeal(
      user.id,
      body.sanctionId,
      body.reason,
      ip,
      request.headers['user-agent'],
    );
  }
}

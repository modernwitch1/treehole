import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { UserAuthGuard } from '../auth/user-auth.guard';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { BoardsService } from './boards.service';
import { AdminAuthGuard, type AdminRequest } from '../admin-auth/admin-auth.guard';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import type { Request } from 'express';

@Controller('boards')
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get()
  listBoards() {
    return this.boards.listBoards();
  }

  @Get('pending')
  @UseGuards(AdminAuthGuard)
  listPendingApplications(@Req() req: AdminRequest, @ClientIp() ip: string) {
    return this.boards.listPendingApplications(
      this.currentAdmin(req),
      ip,
      req.headers['user-agent'],
    );
  }

  @Get(':slug')
  getBoard(@Param('slug') slug: string) {
    return this.boards.getBoard(slug);
  }

  @Post()
  @UseGuards(UserAuthGuard)
  applyForBoard(
    @Body()
    body: { name: string; description: string; reason: string; rulesAcknowledged?: boolean },
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
    @Req() req: Request,
  ) {
    return this.boards.applyForBoard({
      ...body,
      applicantId: user.id,
      rulesAcknowledged: body.rulesAcknowledged === true,
      ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminAuthGuard)
  approveBoard(@Param('id') id: string, @Req() req: AdminRequest, @ClientIp() ip: string) {
    return this.boards.approveBoard(id, this.currentAdmin(req), ip, req.headers['user-agent']);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminAuthGuard)
  rejectBoard(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
  ) {
    return this.boards.rejectBoard(
      id,
      this.currentAdmin(req),
      body.reason,
      ip,
      req.headers['user-agent'],
    );
  }

  private currentAdmin(req: AdminRequest): AdminPrincipal {
    if (!req.admin) {
      throw new UnauthorizedException('未登录');
    }
    return req.admin;
  }
}

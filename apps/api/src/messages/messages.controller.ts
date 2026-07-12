import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { UserAuthGuard } from '../auth/user-auth.guard';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { MessagesService } from './messages.service';
import { ClientIp } from '../common/decorators/client-ip.decorator';

@Controller()
@UseGuards(UserAuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('messages/conversations')
  listConversations(@CurrentUser() user: AuthUser, @Query('cursor') cursor?: string) {
    return this.messages.listConversations(user.id, { cursor });
  }

  @Get('messages/conversations/:id')
  getConversation(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.messages.getConversation(id, user.id);
  }

  @Post('messages/conversations')
  initiateConversation(
    @Body() body: { originPostId: string; initialMessage: string; rulesAcknowledged?: boolean },
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
    @Req() req: Request,
  ) {
    return this.messages.initiateConversation(
      user.id,
      body.originPostId,
      body.initialMessage,
      body.rulesAcknowledged === true,
      ip,
      req.headers['user-agent'],
    );
  }

  @Post('messages/conversations/:id')
  sendMessage(
    @Param('id') id: string,
    @Body() body: { contentMd: string; rulesAcknowledged?: boolean },
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
    @Req() req: Request,
  ) {
    return this.messages.sendMessage(
      id,
      user.id,
      body.contentMd,
      body.rulesAcknowledged === true,
      ip,
      req.headers['user-agent'],
    );
  }

  @Post('messages/conversations/:id/block')
  blockConversation(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.messages.blockConversation(id, user.id);
  }
}

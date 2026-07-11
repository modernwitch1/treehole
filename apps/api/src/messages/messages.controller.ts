import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UserAuthGuard } from '../auth/user-auth.guard';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { MessagesService } from './messages.service';

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
    @Body() body: { originPostId: string; initialMessage: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.messages.initiateConversation(user.id, body.originPostId, body.initialMessage);
  }

  @Post('messages/conversations/:id')
  sendMessage(
    @Param('id') id: string,
    @Body() body: { contentMd: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.messages.sendMessage(id, user.id, body.contentMd);
  }

  @Post('messages/conversations/:id/block')
  blockConversation(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.messages.blockConversation(id, user.id);
  }
}

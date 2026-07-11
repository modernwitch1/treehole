import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { UserAuthGuard } from '../auth/user-auth.guard';
import { AdminAuthGuard, type AdminRequest } from '../admin-auth/admin-auth.guard';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import { ChatroomService, type ChatroomDetail, type ChatroomMessageDto } from './chatroom.service';

// DTOs
export class CreateChatroomDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(2048)
  avatarUrl?: string;

  @IsString()
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(2048)
  backgroundUrl?: string;
}

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;
}

// 1. Regular User Endpoints
@Controller('chatrooms')
@UseGuards(UserAuthGuard)
export class ChatroomController {
  constructor(private readonly chatroomService: ChatroomService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateChatroomDto): Promise<ChatroomDetail> {
    return this.chatroomService.createChatroom(user.id, body);
  }

  @Get()
  list(): Promise<ChatroomDetail[]> {
    return this.chatroomService.listChatrooms();
  }

  @Get(':uid')
  getDetail(@Param('uid') uid: string): Promise<ChatroomDetail> {
    return this.chatroomService.getChatroomDetail(uid);
  }

  @Post(':uid/close')
  close(@Param('uid') uid: string, @CurrentUser() user: AuthUser): Promise<void> {
    // Normal user: isAdmin is false
    return this.chatroomService.closeChatroom(uid, user.id, false);
  }

  @Get(':uid/messages')
  getMessages(
    @Param('uid') uid: string,
    @Query('afterId') afterId: string | undefined,
    @CurrentUser() user: AuthUser,
  ): Promise<ChatroomMessageDto[]> {
    return this.chatroomService.getMessages(uid, user.id, false, afterId);
  }

  @Post(':uid/messages')
  sendMessage(
    @Param('uid') uid: string,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
    @Body() body: SendMessageDto,
  ): Promise<ChatroomMessageDto> {
    return this.chatroomService.sendMessage(uid, user.id, body.content, ip);
  }
}

// 2. Admin/Moderator Endpoints
@Controller('admin/chatrooms')
@UseGuards(AdminAuthGuard)
export class AdminChatroomController {
  constructor(private readonly chatroomService: ChatroomService) {}

  @Get()
  listAll(): Promise<ChatroomDetail[]> {
    return this.chatroomService.listChatrooms();
  }

  @Get('flagged-messages')
  getFlaggedMessages(@Req() req: AdminRequest): Promise<any[]> {
    if (req.admin?.role !== 'admin') {
      throw new ForbiddenException('只有管理员可以查看溯源信息');
    }
    return this.chatroomService.getFlaggedMessages();
  }

  @Get(':uid/messages')
  getMessagesForAdmin(
    @Param('uid') uid: string,
    @Query('afterId') afterId: string | undefined,
    @Req() req: AdminRequest,
  ): Promise<ChatroomMessageDto[]> {
    const adminId = BigInt(req.admin!.id);
    return this.chatroomService.getMessages(uid, adminId, req.admin!.role === 'admin', afterId);
  }

  @Post('messages/:id/flag')
  flagMessage(@Param('id') id: string, @Req() req: AdminRequest): Promise<void> {
    const adminId = BigInt(req.admin!.id);
    return this.chatroomService.flagMessage(id, adminId);
  }

  @Post(':uid/close')
  closeForAdmin(@Param('uid') uid: string, @Req() req: AdminRequest): Promise<void> {
    const adminId = BigInt(req.admin!.id);
    return this.chatroomService.closeChatroom(uid, adminId, true);
  }
}

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { UserAuthGuard } from '../auth/user-auth.guard';
import { AdminAuthGuard, type AdminRequest } from '../admin-auth/admin-auth.guard';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import {
  type AdminFlaggedMessageDto,
  ChatroomService,
  type ChatroomDetail,
  type ChatroomMessageDto,
} from './chatroom.service';

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

  @IsBoolean()
  rulesAcknowledged!: boolean;
}

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;

  @IsBoolean()
  rulesAcknowledged!: boolean;
}

// 1. Regular User Endpoints
@Controller('chatrooms')
@UseGuards(UserAuthGuard)
export class ChatroomController {
  constructor(private readonly chatroomService: ChatroomService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateChatroomDto,
    @ClientIp() ip: string,
    @Req() req: Request,
  ): Promise<ChatroomDetail> {
    return this.chatroomService.createChatroom(user.id, body, ip, req.headers['user-agent']);
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
    return this.chatroomService.getMessages(uid, user.id, afterId);
  }

  @Post(':uid/messages')
  sendMessage(
    @Param('uid') uid: string,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
    @Body() body: SendMessageDto,
    @Req() req: Request,
  ): Promise<ChatroomMessageDto> {
    return this.chatroomService.sendMessage(
      uid,
      user.id,
      body.content,
      ip,
      body.rulesAcknowledged,
      req.headers['user-agent'],
    );
  }
}

// 2. Admin/Moderator Endpoints
@Controller('admin/chatrooms')
@UseGuards(AdminAuthGuard)
export class AdminChatroomController {
  constructor(private readonly chatroomService: ChatroomService) {}

  @Get()
  listAll(@Req() req: AdminRequest): Promise<ChatroomDetail[]> {
    this.requireSuperadmin(req);
    return this.chatroomService.listChatrooms();
  }

  @Get('flagged-messages')
  getFlaggedMessages(
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
  ): Promise<AdminFlaggedMessageDto[]> {
    const admin = this.requireSuperadmin(req);
    return this.chatroomService.getFlaggedMessages({
      actorId: BigInt(admin.id),
      role: admin.role,
      ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get(':uid/messages')
  getMessagesForAdmin(
    @Param('uid') uid: string,
    @Query('afterId') afterId: string | undefined,
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
  ): Promise<ChatroomMessageDto[]> {
    const admin = this.requireSuperadmin(req);
    return this.chatroomService.getMessagesForAdmin(
      uid,
      {
        actorId: BigInt(admin.id),
        role: admin.role,
        ip,
        userAgent: req.headers['user-agent'],
      },
      afterId,
    );
  }

  @Post('messages/:id/flag')
  flagMessage(
    @Param('id') id: string,
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
  ): Promise<void> {
    const adminId = this.adminId(req);
    return this.chatroomService.flagMessage(id, adminId, ip, req.headers['user-agent']);
  }

  @Post(':uid/close')
  closeForAdmin(
    @Param('uid') uid: string,
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
  ): Promise<void> {
    const adminId = this.adminId(req);
    return this.chatroomService.closeChatroom(uid, adminId, true, ip, req.headers['user-agent']);
  }

  private adminId(req: AdminRequest): bigint {
    return BigInt(this.requireSuperadmin(req).id);
  }

  private requireSuperadmin(req: AdminRequest): AdminPrincipal {
    const admin = this.currentAdmin(req);
    if (admin.role !== 'superadmin') {
      throw new ForbiddenException('普通管理员只能处理帖子举报');
    }
    return admin;
  }

  private currentAdmin(req: AdminRequest): AdminPrincipal {
    if (!req.admin) {
      throw new UnauthorizedException('未登录');
    }
    return req.admin;
  }
}

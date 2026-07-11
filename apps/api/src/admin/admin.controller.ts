import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import { AdminAuthGuard, type AdminRequest } from '../admin-auth/admin-auth.guard';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  stats() {
    return this.admin.getStats();
  }

  @Get('users')
  listUsers(
    @Query('q') q?: string,
    @Query('status') status?: 'active' | 'suspended' | 'banned',
    @Query('role') role?: 'user' | 'moderator' | 'admin',
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Req() req?: AdminRequest,
  ) {
    return this.admin.listUsers({
      q,
      status,
      role,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    }, this.currentAdmin(req!));
  }

  @Post('users/:id/suspend')
  suspendUser(@Param('id') id: string, @Req() req: AdminRequest, @ClientIp() ip: string) {
    return this.admin.suspendUser(id, this.currentAdmin(req), ip, req.headers['user-agent']);
  }

  @Post('users/:id/ban')
  banUser(@Param('id') id: string, @Req() req: AdminRequest, @ClientIp() ip: string) {
    return this.admin.banUser(id, this.currentAdmin(req), ip, req.headers['user-agent']);
  }

  @Post('users/:id/unban')
  unbanUser(@Param('id') id: string, @Req() req: AdminRequest, @ClientIp() ip: string) {
    return this.admin.unbanUser(id, this.currentAdmin(req), ip, req.headers['user-agent']);
  }

  @Patch('users/:id/role')
  setUserRole(
    @Param('id') id: string,
    @Body() body: { role: 'moderator' | 'user' },
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
  ) {
    return this.admin.setUserRole(
      id,
      body.role,
      this.currentAdmin(req),
      ip,
      req.headers['user-agent'],
    );
  }

  @Get('reports')
  listReports(
    @Query('status') status: 'open' | 'resolved' | 'rejected' | undefined,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Req() req?: AdminRequest,
  ) {
    return this.admin.listReports(
      {
        status,
        page: page ? parseInt(page, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      },
      this.currentAdmin(req!),
    );
  }

  @Post('reports/:id')
  reviewReport(
    @Param('id') id: string,
    @Body() body: { action: 'hide' | 'resolve' | 'reject'; note?: string },
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
  ) {
    return this.admin.reviewReport(
      id,
      body.action,
      body.note,
      this.currentAdmin(req),
      ip,
      req.headers['user-agent'],
    );
  }

  @Get('posts')
  listPosts(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Req() req?: AdminRequest,
  ) {
    return this.admin.listPosts(
      {
        page: page ? parseInt(page, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      },
      this.currentAdmin(req!),
    );
  }

  @Post('posts/:id')
  applyPostAction(
    @Param('id') id: string,
    @Body() body: { action: 'hide' | 'restore' | 'pin' | 'unpin' | 'lock' | 'unlock' | 'delete' },
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
  ) {
    return this.admin.applyPostAction(
      id,
      body.action,
      this.currentAdmin(req),
      ip,
      req.headers['user-agent'],
    );
  }

  @Get('posts/:id/identity')
  revealPostAuthor(@Param('id') id: string, @Req() req: AdminRequest, @ClientIp() ip: string) {
    return this.admin.revealPostAuthor(id, this.currentAdmin(req), ip, req.headers['user-agent']);
  }

  @Get('comments')
  listComments(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Req() req?: AdminRequest,
  ) {
    return this.admin.listComments(
      {
        page: page ? parseInt(page, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      },
      this.currentAdmin(req!),
    );
  }

  @Post('comments/:id')
  applyCommentAction(
    @Param('id') id: string,
    @Body() body: { action: 'hide' | 'restore' | 'delete' },
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
  ) {
    return this.admin.applyCommentAction(
      id,
      body.action,
      this.currentAdmin(req),
      ip,
      req.headers['user-agent'],
    );
  }

  @Get('comments/:id/identity')
  revealCommentAuthor(@Param('id') id: string, @Req() req: AdminRequest, @ClientIp() ip: string) {
    return this.admin.revealCommentAuthor(
      id,
      this.currentAdmin(req),
      ip,
      req.headers['user-agent'],
    );
  }

  @Get('audit-logs')
  listAuditLogs(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Req() req?: AdminRequest,
  ) {
    return this.admin.listAuditLogs({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    }, this.currentAdmin(req!));
  }

  @Get('announcements')
  listAnnouncements(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.admin.listAnnouncements({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Post('announcements')
  publishAnnouncement(
    @Body() body: { title: string; body: string; linkUrl?: string },
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
  ) {
    return this.admin.publishAnnouncement(
      body,
      this.currentAdmin(req),
      ip,
      req.headers['user-agent'],
    );
  }

  @Get('sensitive-words')
  listSensitiveWords(
    @Query('q') q?: string,
    @Query('category') category?: 'illegal' | 'porn' | 'ad' | 'harassment' | 'other',
    @Query('action') action?: 'block' | 'review' | 'mask',
    @Query('enabled') enabled?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Req() req?: AdminRequest,
  ) {
    return this.admin.listSensitiveWords({
      q,
      category,
      action,
      enabled: enabled === undefined ? undefined : enabled === 'true',
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    }, this.currentAdmin(req!));
  }

  @Post('sensitive-words')
  createSensitiveWord(
    @Body()
    body: {
      word: string;
      category: 'illegal' | 'porn' | 'ad' | 'harassment' | 'other';
      action: 'block' | 'review' | 'mask';
      note?: string;
    },
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
  ) {
    return this.admin.createSensitiveWord(
      body,
      this.currentAdmin(req),
      ip,
      req.headers['user-agent'],
    );
  }

  @Patch('sensitive-words/:id')
  updateSensitiveWord(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      word: string;
      category: 'illegal' | 'porn' | 'ad' | 'harassment' | 'other';
      action: 'block' | 'review' | 'mask';
      enabled: boolean;
      note: string;
    }>,
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
  ) {
    return this.admin.updateSensitiveWord(
      id,
      body,
      this.currentAdmin(req),
      ip,
      req.headers['user-agent'],
    );
  }

  @Delete('sensitive-words/:id')
  deleteSensitiveWord(@Param('id') id: string, @Req() req: AdminRequest, @ClientIp() ip: string) {
    return this.admin.deleteSensitiveWord(
      id,
      this.currentAdmin(req),
      ip,
      req.headers['user-agent'],
    );
  }

  @Post('sensitive-words/reload')
  reloadSensitiveWords(@Req() req: AdminRequest, @ClientIp() ip: string) {
    return this.admin.reloadSensitiveWords(this.currentAdmin(req), ip, req.headers['user-agent']);
  }

  private currentAdmin(req: AdminRequest): AdminPrincipal {
    if (!req.admin) {
      throw new UnauthorizedException('未登录');
    }
    return req.admin;
  }
}

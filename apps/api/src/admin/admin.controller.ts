import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
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
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
    @Query('q') q?: string,
    @Query('status') status?: 'active' | 'suspended' | 'banned',
    @Query('role') role?: 'user' | 'moderator' | 'admin' | 'superadmin',
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.listUsers(
      {
        q,
        status,
        role,
        page: page ? parseInt(page, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      },
      this.currentAdmin(req),
      ip,
      req.headers['user-agent'],
    );
  }

  @Post('users/:id/suspend')
  suspendUser(
    @Param('id') id: string,
    @Body() body: { reason: string; days?: number },
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
  ) {
    return this.admin.suspendUser(
      id,
      body.reason,
      body.days,
      this.currentAdmin(req),
      ip,
      req.headers['user-agent'],
    );
  }

  @Post('users/:id/ban')
  banUser(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
  ) {
    return this.admin.banUser(
      id,
      body.reason,
      this.currentAdmin(req),
      ip,
      req.headers['user-agent'],
    );
  }

  @Post('users/:id/unban')
  unbanUser(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
  ) {
    return this.admin.unbanUser(
      id,
      body.reason,
      this.currentAdmin(req),
      ip,
      req.headers['user-agent'],
    );
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
      this.currentAdmin(req),
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
    @Query('q') q?: string,
    @Query('status') status?: 'published' | 'pending_review' | 'hidden' | 'deleted',
    @Query('reported') reported?: string,
    @Query('boardSlug') boardSlug?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Req() req?: AdminRequest,
  ) {
    return this.admin.listPosts(
      {
        q,
        status,
        reported: reported === 'true',
        boardSlug,
        page: page ? parseInt(page, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      },
      this.currentAdmin(req),
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

  @Post('posts/:id/identity')
  @Header('Cache-Control', 'no-store')
  revealPostAuthor(@Param('id') id: string, @Req() req: AdminRequest, @ClientIp() ip: string) {
    return this.admin.revealPostAuthor(id, this.currentAdmin(req), ip, req.headers['user-agent']);
  }

  @Get('comments')
  listComments(
    @Query('q') q?: string,
    @Query('status') status?: 'published' | 'pending_review' | 'hidden' | 'deleted',
    @Query('reported') reported?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Req() req?: AdminRequest,
  ) {
    return this.admin.listComments(
      {
        q,
        status,
        reported: reported === 'true',
        page: page ? parseInt(page, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      },
      this.currentAdmin(req),
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

  @Post('comments/:id/identity')
  @Header('Cache-Control', 'no-store')
  revealCommentAuthor(@Param('id') id: string, @Req() req: AdminRequest, @ClientIp() ip: string) {
    return this.admin.revealCommentAuthor(
      id,
      this.currentAdmin(req),
      ip,
      req.headers['user-agent'],
    );
  }

  @Post('content/batch')
  batchContentAction(
    @Body()
    body: {
      kind: 'post' | 'comment';
      ids: string[];
      action: 'approve' | 'hide';
    },
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
  ) {
    return this.admin.batchContentAction(
      body,
      this.currentAdmin(req),
      ip,
      req.headers['user-agent'],
    );
  }

  @Get('audit-logs')
  listAuditLogs(
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.listAuditLogs(
      {
        page: page ? parseInt(page, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      },
      this.currentAdmin(req),
      ip,
      req.headers['user-agent'],
    );
  }

  @Get('moderation/cases')
  listModerationCases(
    @Query('caseId') caseId?: string,
    @Query('status') status?: 'pending' | 'in_review' | 'resolved' | 'dismissed',
    @Query('surface')
    surface?: 'post' | 'comment' | 'direct_message' | 'chatroom_message' | 'upload',
    @Query('minRisk') minRisk?: string,
    @Query('assignedToMe') assignedToMe?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Req() req?: AdminRequest,
  ) {
    return this.admin.listModerationCases(
      {
        caseId,
        status,
        surface,
        minRisk: minRisk ? parseInt(minRisk, 10) : undefined,
        assignedToMe: assignedToMe === 'true',
        page: page ? parseInt(page, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      },
      this.currentAdmin(req),
    );
  }

  @Post('moderation/cases/:id/claim')
  claimModerationCase(
    @Param('id') id: string,
    @Body() body: { version: number },
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
  ) {
    return this.admin.claimModerationCase(
      id,
      body.version,
      this.currentAdmin(req),
      ip,
      req.headers['user-agent'],
    );
  }

  @Post('moderation/cases/:id/decision')
  decideModerationCase(
    @Param('id') id: string,
    @Body()
    body: {
      version: number;
      decision: 'allow' | 'warn' | 'hide' | 'delete' | 'suspend' | 'ban';
      note: string;
      sanctionDays?: number;
    },
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
  ) {
    return this.admin.decideModerationCase(
      id,
      body,
      this.currentAdmin(req),
      ip,
      req.headers['user-agent'],
    );
  }

  @Post('moderation/cases/:id/identity')
  @Header('Cache-Control', 'no-store')
  revealModerationCaseAuthor(
    @Param('id') id: string,
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
  ) {
    return this.admin.revealModerationCaseAuthor(
      id,
      this.currentAdmin(req),
      ip,
      req.headers['user-agent'],
    );
  }

  @Get('uploads')
  listPendingUploads(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.admin.listPendingUploads({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get('appeals')
  listAppeals(
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
    @Query('status') status?: 'pending' | 'approved' | 'rejected',
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.listAppeals(
      {
        status,
        page: page ? parseInt(page, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      },
      this.currentAdmin(req),
      ip,
      req.headers['user-agent'],
    );
  }

  @Post('appeals/:id')
  reviewAppeal(
    @Param('id') id: string,
    @Body() body: { action: 'approve' | 'reject'; note: string },
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
  ) {
    return this.admin.reviewAppeal(
      id,
      body.action,
      body.note,
      this.currentAdmin(req),
      ip,
      req.headers['user-agent'],
    );
  }

  @Post('uploads/:id')
  reviewUpload(
    @Param('id') id: string,
    @Body() body: { action: 'approve' | 'reject'; note?: string },
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
  ) {
    return this.admin.reviewUpload(
      id,
      body.action,
      body.note,
      this.currentAdmin(req),
      ip,
      req.headers['user-agent'],
    );
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
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
    @Query('q') q?: string,
    @Query('category') category?: 'illegal' | 'porn' | 'ad' | 'harassment' | 'other',
    @Query('action') action?: 'block' | 'review' | 'mask',
    @Query('enabled') enabled?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.listSensitiveWords(
      {
        q,
        category,
        action,
        enabled: enabled === undefined ? undefined : enabled === 'true',
        page: page ? parseInt(page, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      },
      this.currentAdmin(req),
      ip,
      req.headers['user-agent'],
    );
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

  private currentAdmin(req?: AdminRequest): AdminPrincipal {
    if (!req?.admin) {
      throw new UnauthorizedException('未登录');
    }
    return req.admin;
  }
}

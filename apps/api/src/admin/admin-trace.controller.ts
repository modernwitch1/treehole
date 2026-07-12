import {
  Controller,
  Get,
  Header,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthGuard, type AdminRequest } from '../admin-auth/admin-auth.guard';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import { TraceDirectMessagesQueryDto } from './admin-trace.dto';
import { AdminTraceService } from './admin-trace.service';

@Controller('admin/trace')
@UseGuards(AdminAuthGuard)
export class AdminTraceController {
  constructor(private readonly trace: AdminTraceService) {}

  @Get('direct-messages')
  @Header('Cache-Control', 'private, no-store')
  traceDirectMessages(
    @Query() query: TraceDirectMessagesQueryDto,
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
  ) {
    return this.trace.traceDirectMessages(
      query,
      this.currentAdmin(req),
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

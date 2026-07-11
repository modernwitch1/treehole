import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthGuard, type AdminRequest } from '../admin-auth/admin-auth.guard';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import { RegistrationService } from './registration.service';

@Controller('admin/registrations')
@UseGuards(AdminAuthGuard)
export class RegistrationController {
  constructor(private readonly service: RegistrationService) {}

  @Get()
  async list(@Req() req: AdminRequest) {
    return this.service.list(this.currentAdmin(req));
  }

  @Post(':id')
  async review(
    @Param('id') id: string,
    @Body() body: { action: 'approve' | 'reject'; note?: string },
    @Req() req: AdminRequest,
    @ClientIp() ip: string,
  ) {
    return this.service.review(
      id,
      body.action,
      body.note,
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

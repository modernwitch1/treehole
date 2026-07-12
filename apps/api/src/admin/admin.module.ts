import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminTraceController } from './admin-trace.controller';
import { AdminTraceService } from './admin-trace.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminController, AdminTraceController],
  providers: [AdminService, AdminTraceService],
  exports: [AdminService],
})
export class AdminModule {}

import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsService } from './reports.service';

@Module({
  imports: [PrismaModule, CommonModule],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}

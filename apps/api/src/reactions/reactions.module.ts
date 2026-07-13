import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReactionsService } from './reactions.service';

@Module({
  imports: [PrismaModule, CommonModule],
  providers: [ReactionsService],
  exports: [ReactionsService],
})
export class ReactionsModule {}

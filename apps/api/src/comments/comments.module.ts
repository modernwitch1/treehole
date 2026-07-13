import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CommentsService } from './comments.service';

@Module({
  imports: [PrismaModule, CommonModule],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}

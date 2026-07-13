import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { PostsModule } from '../posts';
import { CommentsModule } from '../comments';
import { ReactionsModule } from '../reactions';
import { ReportsModule } from '../reports';

@Module({
  imports: [AuthModule, PostsModule, CommentsModule, ReactionsModule, ReportsModule],
  controllers: [ContentController],
  providers: [ContentService],
})
export class ContentModule {}

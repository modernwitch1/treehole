import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { AppConfigModule } from '../config/config.module';
import { PostsCommandService } from './posts-command.service';
import { PostsService } from './posts.service';

@Module({
  imports: [PrismaModule, AppConfigModule, CommonModule],
  providers: [PostsService, PostsCommandService],
  exports: [PostsService, PostsCommandService],
})
export class PostsModule {}

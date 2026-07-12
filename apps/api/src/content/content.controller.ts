import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ContentService } from './content.service';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { UserAuthGuard } from '../auth/user-auth.guard';
import { ClientIp } from '../common/decorators/client-ip.decorator';

@Controller()
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get('posts')
  @UseGuards(UserAuthGuard)
  listPosts(
    @Query('sort') sort?: string,
    @Query('cursor') cursor?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.content.listPosts({ sort, cursor, q, limit, userId: user?.id });
  }

  @Get('boards/:slug/posts')
  @UseGuards(UserAuthGuard)
  listBoardPosts(
    @Param('slug') slug: string,
    @Query('sort') sort?: string,
    @Query('cursor') cursor?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.content.listPosts({ boardSlug: slug, sort, cursor, q, limit, userId: user?.id });
  }

  @Post('posts')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(UserAuthGuard)
  createPost(
    @Body()
    body: {
      title: string;
      contentMd: string;
      boardSlug: string;
      isAnonymous?: boolean;
      imageUrls?: string[];
      quotedPostId?: string;
      rulesAcknowledged?: boolean;
    },
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
    @Req() req: Request,
  ) {
    return this.content.createPost({
      ...body,
      authorId: user.id,
      authorIp: ip,
      authorUserAgent: req.headers['user-agent'],
    });
  }

  @Get('posts/:id')
  @UseGuards(UserAuthGuard)
  getPost(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.content.getPost(id, user.id);
  }

  @Get('posts/:id/comments')
  @UseGuards(UserAuthGuard)
  listComments(@Param('id') id: string, @Query('cursor') cursor?: string) {
    return this.content.listComments(id, { cursor });
  }

  @Post('posts/:id/comments')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(UserAuthGuard)
  createComment(
    @Param('id') id: string,
    @Body()
    body: {
      contentMd: string;
      parentId?: string;
      isAnonymous?: boolean;
      rulesAcknowledged?: boolean;
    },
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
    @Req() req: Request,
  ) {
    return this.content.createComment({
      postId: id,
      contentMd: body.contentMd,
      parentId: body.parentId,
      isAnonymous: body.isAnonymous !== false,
      authorId: user.id,
      rulesAcknowledged: body.rulesAcknowledged === true,
      authorIp: ip,
      authorUserAgent: req.headers['user-agent'],
    });
  }

  @Post('posts/:id/vote')
  @HttpCode(HttpStatus.OK)
  @UseGuards(UserAuthGuard)
  votePost(@Param('id') id: string, @Body() body: { value: 1 | 0 }, @CurrentUser() user: AuthUser) {
    return this.content.vote('post', id, body.value, user.id);
  }

  @Post('comments/:id/vote')
  @HttpCode(HttpStatus.OK)
  @UseGuards(UserAuthGuard)
  voteComment(
    @Param('id') id: string,
    @Body() body: { value: 1 | -1 | 0 },
    @CurrentUser() user: AuthUser,
  ) {
    return this.content.vote('comment', id, body.value, user.id);
  }

  @Post('reports')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(UserAuthGuard)
  report(
    @Body()
    body: {
      targetType:
        | 'post'
        | 'comment'
        | 'user'
        | 'conversation'
        | 'direct_message'
        | 'chatroom_message';
      targetId: string;
      category: 'illegal' | 'porn' | 'ad' | 'harassment' | 'other';
      reason?: string;
      evidenceMessageIds?: string[];
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.content.reportTarget({ ...body, reporterId: user.id });
  }
}

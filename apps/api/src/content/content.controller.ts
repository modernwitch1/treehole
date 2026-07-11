import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ContentService } from './content.service';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { UserAuthGuard } from '../auth/user-auth.guard';

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
  ) {
    return this.content.listPosts({ sort, cursor, q, limit });
  }

  @Get('boards/:slug/posts')
  @UseGuards(UserAuthGuard)
  listBoardPosts(
    @Param('slug') slug: string,
    @Query('sort') sort?: string,
    @Query('cursor') cursor?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.content.listPosts({ boardSlug: slug, sort, cursor, q, limit });
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
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.content.createPost({
      ...body,
      authorId: user.id,
    });
  }

  @Get('posts/:id')
  @UseGuards(UserAuthGuard)
  getPost(@Param('id') id: string) {
    return this.content.getPost(id);
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
    @Body() body: { contentMd: string; parentId?: string; isAnonymous?: boolean },
    @CurrentUser() user: AuthUser,
  ) {
    return this.content.createComment({
      postId: id,
      contentMd: body.contentMd,
      parentId: body.parentId,
      isAnonymous: body.isAnonymous !== false,
      authorId: user.id,
    });
  }

  @Post('posts/:id/vote')
  @HttpCode(HttpStatus.OK)
  @UseGuards(UserAuthGuard)
  votePost(
    @Param('id') id: string,
    @Body() body: { value: 1 | -1 | 0 },
    @CurrentUser() user: AuthUser,
  ) {
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
      targetType: 'post' | 'comment' | 'user';
      targetId: string;
      category: 'illegal' | 'porn' | 'ad' | 'harassment' | 'other';
      reason?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.content.reportTarget({ ...body, reporterId: user.id });
  }
}

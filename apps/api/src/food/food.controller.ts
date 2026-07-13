import {
  BadRequestException,
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
import { UserAuthGuard } from '../auth/user-auth.guard';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import {
  CreateFoodReviewDto,
  FoodFeedQueryDto,
  FoodReportDto,
  FoodReviewQueryDto,
} from './food.dto';
import { FoodService } from './food.service';

@Controller('food')
export class FoodController {
  constructor(private readonly food: FoodService) {}

  @Get('canteens')
  @UseGuards(UserAuthGuard)
  listCanteens() {
    return this.food.listCanteens();
  }

  @Get('canteens/:slug')
  @UseGuards(UserAuthGuard)
  getCanteen(@Param('slug') slug: string) {
    return this.food.getCanteen(slug);
  }

  @Get('merchants')
  @UseGuards(UserAuthGuard)
  listMerchants(@Query('canteen') canteen?: string) {
    return this.food.listMerchants(canteen);
  }

  @Get('merchants/:slug')
  @UseGuards(UserAuthGuard)
  getMerchant(@Param('slug') slug: string) {
    return this.food.getMerchant(slug);
  }

  @Get('feed')
  @UseGuards(UserAuthGuard)
  listFeed(@Query() query: FoodFeedQueryDto) {
    return this.food.listFeed(query);
  }

  @Get('posts/:id')
  @UseGuards(UserAuthGuard)
  getPost(@Param('id') id: string) {
    return this.food.getPost(id);
  }

  @Get('windows/:id/reviews')
  @UseGuards(UserAuthGuard)
  listReviews(@Param('id') id: string, @Query() query: FoodReviewQueryDto) {
    return this.food.listWindowReviews(id, query);
  }

  @Post('windows/:id/reviews')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(UserAuthGuard)
  createReview(
    @Param('id') id: string,
    @Body() body: CreateFoodReviewDto,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
    @Req() request: Request,
  ) {
    return this.food.createReview(id, user.id, body, ip, request.headers['user-agent']);
  }

  @Post('reports/:kind/:id')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(UserAuthGuard)
  report(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: FoodReportDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (!['food_post', 'food_review', 'food_reply'].includes(kind)) {
      throw new BadRequestException('无效的内容类型');
    }
    return this.food.report(
      kind as 'food_post' | 'food_review' | 'food_reply',
      id,
      user.id,
      body.category,
      body.reason,
    );
  }
}

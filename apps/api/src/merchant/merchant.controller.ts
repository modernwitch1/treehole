import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import { RateLimitService } from '../common/security/rate-limit.service';
import { MerchantAccount } from '../merchant-auth/merchant-auth.decorator';
import { MerchantAuthGuard, type MerchantPrincipal } from '../merchant-auth/merchant-auth.guard';
import { UploadService } from '../upload/upload.service';
import { CreateFoodPostDto } from '../food/food.dto';
import {
  CreateMerchantProductDto,
  MerchantPostQueryDto,
  MerchantProductQueryDto,
  MerchantReplyDto,
  MerchantReviewQueryDto,
  UpdateMerchantProfileDto,
  UpdateMerchantProductDto,
  UpdateMerchantWindowDto,
  UpdateMerchantPostDto,
} from './merchant.dto';
import { MerchantService } from './merchant.service';

@Controller('merchant')
@UseGuards(MerchantAuthGuard)
export class MerchantController {
  constructor(
    private readonly merchant: MerchantService,
    private readonly upload: UploadService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get('me')
  me(@MerchantAccount() account: MerchantPrincipal) {
    return this.merchant.getContext(account);
  }

  @Patch('merchants/:merchantId')
  updateMerchant(
    @MerchantAccount() account: MerchantPrincipal,
    @Param('merchantId') merchantId: string,
    @Body() body: UpdateMerchantProfileDto,
  ) {
    return this.merchant.updateMerchant(account, merchantId, body);
  }

  @Patch('windows/:id')
  updateWindow(
    @MerchantAccount() account: MerchantPrincipal,
    @Param('id') id: string,
    @Body() body: UpdateMerchantWindowDto,
  ) {
    return this.merchant.updateWindow(account, id, body);
  }

  @Get('products')
  products(@MerchantAccount() account: MerchantPrincipal, @Query() query: MerchantProductQueryDto) {
    return this.merchant.listProducts(account, query);
  }

  @Post('products')
  @HttpCode(HttpStatus.CREATED)
  createProduct(
    @MerchantAccount() account: MerchantPrincipal,
    @Body() body: CreateMerchantProductDto,
  ) {
    return this.merchant.createProduct(account, body);
  }

  @Patch('products/:id')
  updateProduct(
    @MerchantAccount() account: MerchantPrincipal,
    @Param('id') id: string,
    @Body() body: UpdateMerchantProductDto,
  ) {
    return this.merchant.updateProduct(account, id, body);
  }

  @Post('products/:id/submit')
  submitProduct(@MerchantAccount() account: MerchantPrincipal, @Param('id') id: string) {
    return this.merchant.submitProduct(account, id);
  }

  @Get('posts')
  posts(@MerchantAccount() account: MerchantPrincipal, @Query() query: MerchantPostQueryDto) {
    return this.merchant.listPosts(account, query);
  }

  @Post('posts')
  @HttpCode(HttpStatus.CREATED)
  createPost(@MerchantAccount() account: MerchantPrincipal, @Body() body: CreateFoodPostDto) {
    return this.merchant.createPost(account, body);
  }

  @Patch('posts/:id')
  updatePost(
    @MerchantAccount() account: MerchantPrincipal,
    @Param('id') id: string,
    @Body() body: UpdateMerchantPostDto,
  ) {
    return this.merchant.updatePost(account, id, body);
  }

  @Get('reviews')
  reviews(@MerchantAccount() account: MerchantPrincipal, @Query() query: MerchantReviewQueryDto) {
    return this.merchant.listReviews(account, query);
  }

  @Post('reviews/:id/replies')
  @HttpCode(HttpStatus.CREATED)
  reply(
    @MerchantAccount() account: MerchantPrincipal,
    @Param('id') id: string,
    @Body() body: MerchantReplyDto,
  ) {
    return this.merchant.createReply(account, id, body);
  }

  @Post('uploads/food-image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  async uploadFoodImage(
    @UploadedFile() file: Express.Multer.File,
    @MerchantAccount() account: MerchantPrincipal,
    @ClientIp() ip: string,
    @Req() request: Request,
  ) {
    await this.rateLimit.consume(
      'upload-merchant-food',
      String(account.id),
      30,
      3600,
      '上传过于频繁，请稍后再试',
    );
    return this.upload.uploadMerchantFoodImage(file, account.id, ip, request.headers['user-agent']);
  }
}

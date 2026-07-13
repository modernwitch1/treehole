import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  ForbiddenException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthGuard, type AdminRequest } from '../admin-auth/admin-auth.guard';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';
import {
  CreateFoodCanteenDto,
  CreateMerchantPortalInvitationDto,
  CreateFoodMerchantDto,
  CreateFoodWindowDto,
  FoodAdminContentActionDto,
  FoodAdminContentListQueryDto,
  FoodAdminInvitationListQueryDto,
  FoodAdminListQueryDto,
  FoodAdminProductListQueryDto,
  FoodAdminStaffListQueryDto,
  UpdateFoodCanteenDto,
  UpdateFoodMerchantDto,
  UpdateFoodStaffDto,
  UpdateFoodWindowDto,
} from './food.dto';
import { FoodService } from './food.service';

@Controller('admin/food')
@UseGuards(AdminAuthGuard)
export class FoodAdminController {
  constructor(private readonly food: FoodService) {}

  @Get('canteens')
  listCanteens(@Req() request: AdminRequest) {
    this.requireAdmin(request);
    return this.food.adminListCanteens();
  }

  @Post('canteens')
  createCanteen(@Body() body: CreateFoodCanteenDto, @Req() request: AdminRequest) {
    const admin = this.requireAdmin(request);
    return this.food.createCanteen(body, BigInt(admin.id));
  }

  @Patch('canteens/:id')
  updateCanteen(
    @Param('id') id: string,
    @Body() body: UpdateFoodCanteenDto,
    @Req() request: AdminRequest,
  ) {
    const admin = this.requireAdmin(request);
    return this.food.updateCanteen(id, body, BigInt(admin.id));
  }

  @Get('merchants')
  listMerchants(@Query() query: FoodAdminListQueryDto) {
    return this.food.adminListMerchants(query);
  }

  @Post('merchants')
  createMerchant(@Body() body: CreateFoodMerchantDto, @Req() request: AdminRequest) {
    const admin = this.requireAdmin(request);
    return this.food.createMerchant(body, BigInt(admin.id));
  }

  @Patch('merchants/:id')
  updateMerchant(
    @Param('id') id: string,
    @Body() body: UpdateFoodMerchantDto,
    @Req() request: AdminRequest,
  ) {
    const admin = this.requireAdmin(request);
    return this.food.updateMerchant(id, body, BigInt(admin.id));
  }

  @Post('merchants/:id/windows')
  createWindow(
    @Param('id') id: string,
    @Body() body: CreateFoodWindowDto,
    @Req() request: AdminRequest,
  ) {
    const admin = this.requireAdmin(request);
    return this.food.createWindow(id, body, BigInt(admin.id));
  }

  @Patch('windows/:id')
  updateWindow(
    @Param('id') id: string,
    @Body() body: UpdateFoodWindowDto,
    @Req() request: AdminRequest,
  ) {
    const admin = this.requireAdmin(request);
    return this.food.updateWindow(id, body, BigInt(admin.id));
  }

  @Post('merchants/:id/invitations')
  createInvitation(
    @Param('id') id: string,
    @Body() body: CreateMerchantPortalInvitationDto,
    @Req() request: AdminRequest,
  ) {
    const admin = this.requireAdmin(request);
    return this.food.createPortalInvitation(id, body, BigInt(admin.id));
  }

  @Get('staff')
  listStaff(@Query() query: FoodAdminStaffListQueryDto, @Req() request: AdminRequest) {
    this.requireAdmin(request);
    return this.food.adminListStaff(query);
  }

  @Post('staff/:id/revoke')
  revokeStaff(@Param('id') id: string, @Req() request: AdminRequest) {
    const admin = this.requireAdmin(request);
    return this.food.revokeStaff(id, BigInt(admin.id));
  }

  @Patch('staff/:id')
  updateStaff(
    @Param('id') id: string,
    @Body() body: UpdateFoodStaffDto,
    @Req() request: AdminRequest,
  ) {
    const admin = this.requireAdmin(request);
    return this.food.updateStaff(id, body, BigInt(admin.id));
  }

  @Get('invitations')
  listInvitations(@Query() query: FoodAdminInvitationListQueryDto, @Req() request: AdminRequest) {
    this.requireAdmin(request);
    return this.food.adminListInvitations(query);
  }

  @Post('invitations/:id/revoke')
  revokeInvitation(@Param('id') id: string, @Req() request: AdminRequest) {
    const admin = this.requireAdmin(request);
    return this.food.revokeInvitation(id, BigInt(admin.id));
  }

  @Get('stats')
  stats(@Req() request: AdminRequest) {
    this.requireAdmin(request);
    return this.food.adminStats();
  }

  @Get('posts')
  listPosts(@Query() query: FoodAdminContentListQueryDto) {
    return this.food.adminListPosts(query);
  }

  @Post('posts/:id/action')
  applyPostAction(
    @Param('id') id: string,
    @Body() body: FoodAdminContentActionDto,
    @Req() request: AdminRequest,
  ) {
    return this.food.applyContentAction(
      'post',
      id,
      body.action,
      BigInt(this.currentAdmin(request).id),
      body.note,
    );
  }

  @Get('reviews')
  listReviews(@Query() query: FoodAdminContentListQueryDto) {
    return this.food.adminListReviews(query);
  }

  @Get('replies')
  listReplies(@Query() query: FoodAdminContentListQueryDto) {
    return this.food.adminListReplies(query);
  }

  @Get('products')
  listProducts(@Query() query: FoodAdminProductListQueryDto) {
    return this.food.adminListProducts(query);
  }

  @Post('products/:id/action')
  applyProductAction(
    @Param('id') id: string,
    @Body() body: FoodAdminContentActionDto,
    @Req() request: AdminRequest,
  ) {
    return this.food.applyContentAction(
      'product',
      id,
      body.action,
      BigInt(this.currentAdmin(request).id),
      body.note,
    );
  }

  @Post('reviews/:id/action')
  applyReviewAction(
    @Param('id') id: string,
    @Body() body: FoodAdminContentActionDto,
    @Req() request: AdminRequest,
  ) {
    return this.food.applyContentAction(
      'review',
      id,
      body.action,
      BigInt(this.currentAdmin(request).id),
      body.note,
    );
  }

  @Post('replies/:id/action')
  applyReplyAction(
    @Param('id') id: string,
    @Body() body: FoodAdminContentActionDto,
    @Req() request: AdminRequest,
  ) {
    return this.food.applyContentAction(
      'reply',
      id,
      body.action,
      BigInt(this.currentAdmin(request).id),
      body.note,
    );
  }

  private requireAdmin(request: AdminRequest): AdminPrincipal {
    const admin = this.currentAdmin(request);
    if (admin.role === 'moderator') {
      throw new ForbiddenException('只有管理员或超级管理员可以管理商家和员工');
    }
    return admin;
  }

  private currentAdmin(request: AdminRequest): AdminPrincipal {
    if (!request.admin) {
      throw new UnauthorizedException('未登录');
    }
    return request.admin;
  }
}

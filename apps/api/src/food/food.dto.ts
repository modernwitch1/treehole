import { Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class FoodFeedQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  canteen?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  merchant?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class FoodReviewQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class CreateFoodReviewDto {
  @IsIn(['taste_review', 'suggestion'])
  type!: 'taste_review' | 'suggestion';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  tasteScore?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  contentMd!: string;

  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;

  @Equals(true, { message: '请先阅读并同意社区规则' })
  rulesAcknowledged!: boolean;
}

export class CreateFoodPostDto {
  @IsIn(['new_product', 'promotion', 'advertisement', 'notice'])
  type!: 'new_product' | 'promotion' | 'advertisement' | 'notice';

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(12000)
  contentMd!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  windowId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  coverUrl?: string;

  @IsOptional()
  @Type(() => Date)
  publishAt?: Date;

  @IsOptional()
  @Type(() => Date)
  expiresAt?: Date;
}

export class CreateFoodCanteenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreateFoodMerchantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactDisplay?: string;
}

export class UpdateFoodMerchantDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactDisplay?: string;

  @IsOptional()
  @IsIn(['pending', 'active', 'suspended', 'closed'])
  status?: 'pending' | 'active' | 'suspended' | 'closed';
}

export class UpdateFoodCanteenDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateFoodWindowDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  windowNumber?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  floor?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  locationDescription?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateFoodWindowDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  canteenId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  windowNumber?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  floor?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  locationDescription?: string;
}

export const FOOD_PRODUCT_CATEGORIES = ['主食', '小吃', '饮品', '套餐', '其他'] as const;

export class CreateMerchantPortalInvitationDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @IsIn(['owner', 'editor', 'viewer'])
  role?: 'owner' | 'editor' | 'viewer';
}

export class FoodAdminContentActionDto {
  @IsIn(['approve', 'reject', 'hide', 'restore'])
  action!: 'approve' | 'reject' | 'hide' | 'restore';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class FoodAdminListQueryDto {
  @IsOptional()
  @IsIn(['pending', 'active', 'suspended', 'closed'])
  status?: 'pending' | 'active' | 'suspended' | 'closed';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class FoodAdminContentListQueryDto {
  @IsOptional()
  @IsIn(['published', 'pending_review', 'hidden', 'deleted'])
  status?: 'published' | 'pending_review' | 'hidden' | 'deleted';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class FoodAdminProductListQueryDto {
  @IsOptional()
  @IsIn(['draft', 'pending_review', 'published', 'hidden', 'deleted'])
  status?: 'draft' | 'pending_review' | 'published' | 'hidden' | 'deleted';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  merchantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class FoodAdminStaffListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  merchantId?: string;

  @IsOptional()
  @IsIn(['active', 'revoked'])
  status?: 'active' | 'revoked';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class UpdateFoodStaffDto {
  @IsOptional()
  @IsIn(['owner', 'editor', 'viewer'])
  role?: 'owner' | 'editor' | 'viewer';

  @IsOptional()
  @IsIn(['active', 'revoked'])
  status?: 'active' | 'revoked';
}

export class FoodAdminInvitationListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  merchantId?: string;

  @IsOptional()
  @IsIn(['pending', 'accepted', 'expired', 'revoked'])
  status?: 'pending' | 'accepted' | 'expired' | 'revoked';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class FoodReportDto {
  @IsIn(['illegal', 'porn', 'ad', 'harassment', 'other'])
  category!: 'illegal' | 'porn' | 'ad' | 'harassment' | 'other';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

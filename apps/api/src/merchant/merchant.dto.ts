import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class MerchantIdParamDto {
  @IsString()
  @MinLength(1)
  merchantId!: string;
}

export class UpdateMerchantProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
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
  @IsString()
  @MaxLength(2048)
  logoUrl?: string;
}

export class UpdateMerchantWindowDto {
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
  @IsString()
  @MaxLength(200)
  locationDescription?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class MerchantProductQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  merchantId?: string;

  @IsOptional()
  @IsIn(['draft', 'pending_review', 'published', 'hidden', 'deleted'])
  status?: 'draft' | 'pending_review' | 'published' | 'hidden' | 'deleted';
}

export class CreateMerchantProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  priceCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  imageUrl?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  windowId!: string;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;
}

export class UpdateMerchantProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  priceCents?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  windowId?: string;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;
}

export class MerchantPostQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  merchantId?: string;

  @IsOptional()
  @IsIn(['draft', 'pending_review', 'published', 'hidden', 'deleted'])
  status?: 'draft' | 'pending_review' | 'published' | 'hidden' | 'deleted';
}

export class MerchantReviewQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  merchantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  windowId?: string;
}

export class MerchantReplyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  contentMd!: string;
}

export class UpdateMerchantPostDto {
  @IsOptional()
  @IsIn(['new_product', 'promotion', 'advertisement', 'notice'])
  type?: 'new_product' | 'promotion' | 'advertisement' | 'notice';

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(12000)
  contentMd?: string;

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

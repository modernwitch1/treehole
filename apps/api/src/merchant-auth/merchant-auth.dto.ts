import { Equals, IsString, MaxLength, MinLength } from 'class-validator';

export class MerchantLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class AcceptMerchantInvitationDto {
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  token!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @Equals(true, { message: '必须同意商家后台服务条款' })
  acceptTerms!: boolean;
}

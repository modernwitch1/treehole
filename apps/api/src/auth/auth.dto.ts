import {
  Equals,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  studentId!: string;

  @ValidateIf((value: RegisterDto) => value.method === 'email')
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  username?: string;

  @ValidateIf((value: RegisterDto) => value.method === 'screenshot')
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  realName?: string;

  @IsIn(['email', 'screenshot'])
  method!: 'email' | 'screenshot';

  @ValidateIf((value: RegisterDto) => value.method === 'screenshot')
  // New uploads use an opaque `upload://...` reference. The service performs
  // the authoritative ownership/path check, so the DTO must not reject that
  // internal reference (or a legacy CDN URL) first.
  @IsString()
  @MaxLength(2048)
  screenshotUrl?: string;

  @Equals(true, { message: '必须同意用户协议和隐私政策' })
  acceptTerms!: boolean;

  @Equals(true, { message: '必须阅读并同意社区规则' })
  acceptCommunityRules!: boolean;

  @IsString()
  @MaxLength(32)
  policyVersion!: string;
}

export class StudentPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(254)
  studentId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class VerifyEmailDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  studentId!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

export class ResendEmailCodeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  studentId!: string;
}

export class PasswordResetRequestDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class PasswordResetConfirmDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{32,128}$/)
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}

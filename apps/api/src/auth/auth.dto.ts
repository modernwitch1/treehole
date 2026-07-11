import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
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
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(2048)
  screenshotUrl?: string;
}

export class StudentPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
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

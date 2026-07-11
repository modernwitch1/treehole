import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class AdminLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(254)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  totpCode?: string;
}

export class TotpCodeDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateAppealDto {
  @IsString()
  @Matches(/^\d+$/)
  sanctionId!: string;

  @IsString()
  @MinLength(20, { message: '申诉理由至少 20 个字' })
  @MaxLength(2000, { message: '申诉理由最多 2000 个字' })
  reason!: string;
}

import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

const POSITIVE_DATABASE_ID = /^[1-9]\d{0,18}$/;

export class TraceDirectMessagesQueryDto {
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DATABASE_ID, { message: 'messageId 必须是有效的正整数 ID' })
  messageId?: string;

  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DATABASE_ID, { message: 'conversationId 必须是有效的正整数 ID' })
  conversationId?: string;

  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DATABASE_ID, { message: 'userId 必须是有效的正整数 ID' })
  userId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

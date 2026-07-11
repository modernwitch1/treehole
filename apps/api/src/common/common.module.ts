import { Global, Module } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { RateLimitService } from './security/rate-limit.service';

@Global()
@Module({
  imports: [PrismaModule, RedisModule],
  providers: [ModerationService, RateLimitService],
  exports: [ModerationService, RateLimitService],
})
export class CommonModule {}

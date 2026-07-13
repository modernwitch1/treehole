import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AppConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MerchantAuthController } from './merchant-auth.controller';
import { MerchantAuthService } from './merchant-auth.service';

@Module({
  imports: [PrismaModule, AuthModule, AppConfigModule],
  controllers: [MerchantAuthController],
  providers: [MerchantAuthService],
  exports: [MerchantAuthService],
})
export class MerchantAuthModule {}

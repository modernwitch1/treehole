import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FoodModule } from '../food/food.module';
import { MerchantAuthGuard } from '../merchant-auth/merchant-auth.guard';
import { MerchantAuthModule } from '../merchant-auth/merchant-auth.module';
import { UploadModule } from '../upload/upload.module';
import { MerchantController } from './merchant.controller';
import { MerchantService } from './merchant.service';

@Module({
  imports: [AuthModule, MerchantAuthModule, FoodModule, UploadModule],
  controllers: [MerchantController],
  providers: [MerchantService, MerchantAuthGuard],
})
export class MerchantModule {}

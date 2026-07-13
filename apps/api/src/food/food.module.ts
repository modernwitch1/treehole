import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { UploadModule } from '../upload/upload.module';
import { FoodAdminController } from './food-admin.controller';
import { FoodController } from './food.controller';
import { FoodService } from './food.service';

@Module({
  imports: [AuthModule, AdminAuthModule, UploadModule],
  controllers: [FoodController, FoodAdminController],
  providers: [FoodService],
  exports: [FoodService],
})
export class FoodModule {}

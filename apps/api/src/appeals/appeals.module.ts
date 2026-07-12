import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AppealAccessGuard } from './appeal-access.guard';
import { AppealsController } from './appeals.controller';
import { AppealsService } from './appeals.service';

@Module({
  imports: [AuthModule],
  controllers: [AppealsController],
  providers: [AppealAccessGuard, AppealsService],
})
export class AppealsModule {}

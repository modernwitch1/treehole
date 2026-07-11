import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AppConfigModule } from '../config/config.module';
import { ChatroomController, AdminChatroomController } from './chatroom.controller';
import { ChatroomService } from './chatroom.service';

@Module({
  imports: [AuthModule, AdminAuthModule, AppConfigModule],
  controllers: [ChatroomController, AdminChatroomController],
  providers: [ChatroomService],
  exports: [ChatroomService],
})
export class ChatroomModule {}

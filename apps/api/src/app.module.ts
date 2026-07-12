import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/config.module';
import { AppConfig } from './config/app.config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RegistrationModule } from './registration/registration.module';
import { UploadModule } from './upload/upload.module';
import { AdminAuthModule } from './admin-auth/admin-auth.module';
import { AdminModule } from './admin/admin.module';
import { ContentModule } from './content/content.module';
import { BoardsModule } from './boards/boards.module';
import { MessagesModule } from './messages/messages.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ChatroomModule } from './chatroom/chatroom.module';
import { AppealsModule } from './appeals/appeals.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { buildPinoConfig } from './common/logger/pino.config';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        buildPinoConfig({
          NODE_ENV: config.get('NODE_ENV'),
          LOG_LEVEL: config.get('LOG_LEVEL'),
          LOG_PRETTY: config.get('LOG_PRETTY'),
        }),
    }),
    PrismaModule,
    RedisModule,
    CommonModule,
    HealthModule,
    AuthModule,
    UsersModule,
    RegistrationModule,
    UploadModule,
    AdminAuthModule,
    AdminModule,
    ContentModule,
    BoardsModule,
    MessagesModule,
    NotificationsModule,
    ChatroomModule,
    AppealsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}

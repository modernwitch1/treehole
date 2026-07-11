import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { UserAuthGuard } from '../auth/user-auth.guard';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { RateLimitService } from '../common/security/rate-limit.service';

@Controller()
export class UploadController {
  constructor(
    private readonly upload: UploadService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Post('uploads/registration')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadRegistration(@UploadedFile() file: Express.Multer.File) {
    return this.upload.uploadRegistrationScreenshot(file);
  }

  @Post('uploads/post-image')
  @HttpCode(HttpStatus.OK)
  @UseGuards(UserAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  async uploadPostImage(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthUser) {
    await this.rateLimit.consume('upload-post-user', String(user.id), 30, 3600, '上传过于频繁，请稍后再试');
    return this.upload.uploadPostImage(file, user.id);
  }

  @Post('uploads/chatroom-image')
  @HttpCode(HttpStatus.OK)
  @UseGuards(UserAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  async uploadChatroomImage(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    await this.rateLimit.consume('upload-chatroom-user', String(user.id), 20, 3600, '上传过于频繁，请稍后再试');
    return this.upload.uploadChatroomImage(file, user.id);
  }
}

import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { UserAuthGuard } from '../auth/user-auth.guard';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { RateLimitService } from '../common/security/rate-limit.service';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';

@Controller()
export class UploadController {
  constructor(
    private readonly upload: UploadService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get('uploads/public/:folder/:filename')
  async publicFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Res() response: Response,
  ) {
    const file = await this.upload.getPublicFile(folder, filename);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Cache-Control', file.cacheControl);
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.send(file.body);
  }

  @Get('admin/uploads/:id/preview')
  @UseGuards(AdminAuthGuard)
  async moderationPreview(@Param('id') id: string, @Res() response: Response) {
    const file = await this.upload.getModerationFile(id);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(file.body);
  }

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
    await this.rateLimit.consume(
      'upload-post-user',
      String(user.id),
      30,
      3600,
      '上传过于频繁，请稍后再试',
    );
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
    await this.rateLimit.consume(
      'upload-chatroom-user',
      String(user.id),
      20,
      3600,
      '上传过于频繁，请稍后再试',
    );
    return this.upload.uploadChatroomImage(file, user.id);
  }
}

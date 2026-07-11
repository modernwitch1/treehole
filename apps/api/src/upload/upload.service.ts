import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import sharp from 'sharp';
import { AppConfig } from '../config/app.config';
import { PrismaService } from '../prisma/prisma.module';

@Injectable()
export class UploadService {
  private s3?: S3Client;

  constructor(
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
  ) {}

  async uploadRegistrationScreenshot(file: Express.Multer.File) {
    return this.uploadPublicFile(file, 'registrations');
  }

  async uploadPostImage(file: Express.Multer.File, userId: bigint) {
    return this.uploadPublicFile(file, 'posts', userId);
  }

  async uploadChatroomImage(file: Express.Multer.File, userId: bigint) {
    return this.uploadPublicFile(file, 'chatrooms', userId);
  }

  private async uploadPublicFile(
    file: Express.Multer.File,
    folder: 'posts' | 'registrations' | 'chatrooms',
    userId?: bigint,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('请选择要上传的图片');
    }
    if (!this.isAllowedImage(file)) {
      throw new BadRequestException('只能上传图片文件');
    }
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { status: true, suspendedUntil: true },
      });
      if (
        !user ||
        user.status === 'banned' ||
        (user.status === 'suspended' && (!user.suspendedUntil || user.suspendedUntil > new Date()))
      ) {
        throw new ForbiddenException('当前账号不能上传图片');
      }
    }

    const processed = await this.reencodeImage(file.buffer);
    const key = `${folder}/${Date.now()}-${randomUUID()}${processed.ext}`;
    await this.getS3Client().send(
      new PutObjectCommand({
        Bucket: this.config.get('S3_UPLOADS_BUCKET'),
        Key: key,
        Body: processed.buffer,
        ContentType: processed.mimeType,
        CacheControl: 'public, max-age=31536000, immutable',
        ContentDisposition: 'inline',
      }),
    );

    if (userId) {
      await this.prisma.upload.create({
        data: {
          userId,
          s3Key: key,
          mimeType: processed.mimeType,
          sizeBytes: processed.buffer.length,
          width: processed.width,
          height: processed.height,
          moderationStatus: 'passed',
        },
      });
    }

    return { url: `${this.config.get('CDN_BASE_URL').replace(/\/+$/, '')}/${key}` };
  }

  private getS3Client() {
    this.s3 ??= new S3Client({
      region: this.config.get('AWS_REGION'),
      endpoint: this.config.get('S3_ENDPOINT') || undefined,
      forcePathStyle: this.config.get('S3_FORCE_PATH_STYLE'),
    });
    return this.s3;
  }

  private isAllowedImage(file: Express.Multer.File) {
    const ext = extname(file.originalname || '').toLowerCase();
    if (ext === '.svg' || file.mimetype === 'image/svg+xml') {
      return false;
    }
    const magic = file.buffer.subarray(0, 12).toString('hex');
    const isPng = magic.startsWith('89504e470d0a1a0a');
    const isJpeg = magic.startsWith('ffd8ff');
    const isGif = magic.startsWith('47494638');
    const isWebp =
      file.buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      file.buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    return file.mimetype.startsWith('image/') && (isPng || isJpeg || isGif || isWebp);
  }

  private async reencodeImage(input: Buffer) {
    const image = sharp(input, { animated: false, limitInputPixels: 24_000_000 }).rotate();
    const metadata = await image.metadata();
    const hasAlpha = Boolean(metadata.hasAlpha);
    const resized = image.resize({
      width: 2400,
      height: 2400,
      fit: 'inside',
      withoutEnlargement: true,
    });
    const buffer = hasAlpha
      ? await resized.png({ compressionLevel: 9 }).toBuffer()
      : await resized.jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    const outputMetadata = await sharp(buffer).metadata();
    return {
      buffer,
      ext: hasAlpha ? '.png' : '.jpg',
      mimeType: hasAlpha ? 'image/png' : 'image/jpeg',
      width: outputMetadata.width,
      height: outputMetadata.height,
    };
  }
}

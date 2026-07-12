import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

interface ErrorResponseBody {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    const { status, body } = this.normalize(exception);

    body.requestId = request.id;

    if (status >= 500) {
      const err = exception as Error;
      this.logger.error(
        `unhandled error: ${err.message ?? exception} (${request.method} ${request.path}, requestId=${request.id})`,
        err.stack,
      );
    } else if (status >= 400) {
      this.logger.warn(`client error ${status} ${request.method} ${request.path}: ${body.message}`);
    }

    response.status(status).json(body);
  }

  private normalize(exception: unknown): { status: number; body: ErrorResponseBody } {
    // NestJS HttpException
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        return { status, body: { code: this.statusToCode(status), message: res } };
      }
      const obj = res as Record<string, unknown>;
      const rawMessage = obj.message;
      const message = Array.isArray(rawMessage)
        ? rawMessage.filter((item): item is string => typeof item === 'string').join('; ')
        : typeof rawMessage === 'string'
          ? rawMessage
          : exception.message;
      return {
        status,
        body: {
          code: (obj.code as string) ?? this.statusToCode(status),
          message,
          details: obj.details ?? obj.errors,
        },
      };
    }

    // Prisma known errors
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.handlePrismaKnown(exception);
    }
    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: { code: 'VALIDATION_ERROR', message: 'Invalid input' },
      };
    }

    // Errors raised before a controller runs (JSON parser / Multer) are not
    // Nest HttpExceptions, but may carry an HTTP status.
    if (exception && typeof exception === 'object') {
      const status =
        (exception as { status?: unknown; statusCode?: unknown }).status ??
        (exception as { statusCode?: unknown }).statusCode;
      if (typeof status === 'number' && status >= 400 && status < 500) {
        return {
          status,
          body: {
            code: this.statusToCode(status),
            message:
              status === HttpStatus.PAYLOAD_TOO_LARGE
                ? 'Request body is too large'
                : status === HttpStatus.UNSUPPORTED_MEDIA_TYPE
                  ? 'Unsupported media type'
                  : 'Invalid request body',
          },
        };
      }
    }

    // Fallback
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    };
  }

  private handlePrismaKnown(err: Prisma.PrismaClientKnownRequestError): {
    status: number;
    body: ErrorResponseBody;
  } {
    switch (err.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          body: {
            code: 'UNIQUE_CONSTRAINT',
            message: 'A record with this value already exists',
          },
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          body: { code: 'NOT_FOUND', message: 'Record not found' },
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          body: {
            code: 'FOREIGN_KEY_VIOLATION',
            message: 'Referenced record does not exist',
          },
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          body: { code: 'DATABASE_ERROR', message: 'Database error' },
        };
    }
  }

  private statusToCode(status: number): string {
    return (
      {
        400: 'BAD_REQUEST',
        401: 'UNAUTHORIZED',
        403: 'FORBIDDEN',
        404: 'NOT_FOUND',
        409: 'CONFLICT',
        413: 'PAYLOAD_TOO_LARGE',
        415: 'UNSUPPORTED_MEDIA_TYPE',
        422: 'UNPROCESSABLE_ENTITY',
        429: 'TOO_MANY_REQUESTS',
        500: 'INTERNAL_ERROR',
        503: 'SERVICE_UNAVAILABLE',
      }[status] ?? 'ERROR'
    );
  }
}

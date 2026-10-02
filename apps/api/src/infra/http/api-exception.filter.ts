import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ERROR_CODES, type ApiError } from '@scrum/shared';
import type { Response } from 'express';
import { ZodSerializationException, ZodValidationException } from 'nestjs-zod';

const STATUS_TO_CODE: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: ERROR_CODES.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ERROR_CODES.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ERROR_CODES.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ERROR_CODES.NOT_FOUND,
  [HttpStatus.TOO_MANY_REQUESTS]: ERROR_CODES.RATE_LIMITED,
};

/**
 * Tüm hataları `{ code, details? }` biçimine çevirir (ADR-007).
 * Servisler iş kuralı hatası için `new HttpException({ code: 'SPRINT_ALREADY_ACTIVE' }, 409)` fırlatır.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toApiError(exception);
    res.status(status).json(body);
  }

  toApiError(exception: unknown): { status: number; body: ApiError } {
    if (exception instanceof ZodValidationException) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: { code: ERROR_CODES.VALIDATION_FAILED, details: exception.getZodError() },
      };
    }

    if (exception instanceof HttpException && !(exception instanceof ZodSerializationException)) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'object' && 'code' in response && typeof response.code === 'string') {
        const details = 'details' in response ? response.details : undefined;
        return {
          status,
          body: details === undefined ? { code: response.code } : { code: response.code, details },
        };
      }
      return { status, body: { code: STATUS_TO_CODE[status] ?? ERROR_CODES.INTERNAL } };
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, body: { code: ERROR_CODES.INTERNAL } };
  }
}

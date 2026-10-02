import {
  ConflictException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApiExceptionFilter } from './api-exception.filter';

describe('ApiExceptionFilter', () => {
  const filter = new ApiExceptionFilter();

  it('iş kuralı hatasındaki kodu korur', () => {
    const result = filter.toApiError(
      new HttpException({ code: 'SPRINT_ALREADY_ACTIVE', details: { sprintId: 'x' } }, 409),
    );
    expect(result).toEqual({
      status: 409,
      body: { code: 'SPRINT_ALREADY_ACTIVE', details: { sprintId: 'x' } },
    });
  });

  it('standart HTTP hatalarını koda eşler', () => {
    expect(filter.toApiError(new NotFoundException())).toEqual({
      status: 404,
      body: { code: 'NOT_FOUND' },
    });
  });

  it('eşlemesi olmayan HTTP durumunda INTERNAL döner ama durumu korur', () => {
    expect(filter.toApiError(new ConflictException())).toEqual({
      status: 409,
      body: { code: 'INTERNAL' },
    });
  });

  it('beklenmeyen hatada iç ayrıntı sızdırmaz', () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const result = filter.toApiError(new Error('db password=secret'));
    expect(result).toEqual({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL' },
    });
  });
});

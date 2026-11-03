import { Body, Controller, Get, HttpCode, HttpStatus, Put } from '@nestjs/common';
import {
  PutQuotaRequestSchema,
  QuotasResponseSchema,
  type QuotasResponse,
  WORKSPACE_PERMISSIONS as W,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequirePermission } from '../auth/decorators';
import { QuotasService } from './quotas.service';

class QuotasDto extends createZodDto(QuotasResponseSchema) {}
class PutQuotaDto extends createZodDto(PutQuotaRequestSchema) {}

/** Doküman/video yükleme sınırları (ADR-154): yalnızca Super Admin. */
@Controller('workspaces/:workspaceId/quotas')
export class QuotasController {
  constructor(private readonly quotas: QuotasService) {}

  @Get()
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @ZodResponse({ type: QuotasDto })
  list(): Promise<QuotasResponse> {
    return this.quotas.list();
  }

  @Put()
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async put(@Body() body: PutQuotaDto): Promise<void> {
    await this.quotas.put(body);
  }
}

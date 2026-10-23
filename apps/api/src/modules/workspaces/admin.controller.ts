import { Controller, Get } from '@nestjs/common';
import { AdminOverviewSchema, WORKSPACE_PERMISSIONS as W, type AdminOverview } from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequirePermission } from '../auth/decorators';
import { AdminOverviewService } from './admin-overview.service';

class AdminOverviewDto extends createZodDto(AdminOverviewSchema) {}

/** Yönetici paneli (ADR-139): yalnızca çalışma alanı ayarı izni olanlar (Owner, Admin). */
@Controller('workspaces/:workspaceId/admin')
export class AdminController {
  constructor(private readonly overview: AdminOverviewService) {}

  @Get('overview')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @ZodResponse({ type: AdminOverviewDto })
  get(): Promise<AdminOverview> {
    return this.overview.overview();
  }
}

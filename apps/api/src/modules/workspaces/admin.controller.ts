import { Controller, Get, Query } from '@nestjs/common';
import {
  AdminListQuerySchema,
  AdminListResponseSchema,
  AdminOverviewSchema,
  WORKSPACE_PERMISSIONS as W,
  type AdminListResponse,
  type AdminOverview,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequirePermission } from '../auth/decorators';
import { AdminListService } from './admin-list.service';
import { AdminOverviewService } from './admin-overview.service';

class AdminOverviewDto extends createZodDto(AdminOverviewSchema) {}
class AdminListDto extends createZodDto(AdminListResponseSchema) {}
class AdminListQueryDto extends createZodDto(AdminListQuerySchema) {}

/** Yönetici paneli (ADR-139, ADR-142): yalnızca çalışma alanı ayarı izni olanlar (Owner, Admin). */
@Controller('workspaces/:workspaceId/admin')
export class AdminController {
  constructor(
    private readonly overview: AdminOverviewService,
    private readonly lists: AdminListService,
  ) {}

  @Get('overview')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @ZodResponse({ type: AdminOverviewDto })
  get(): Promise<AdminOverview> {
    return this.overview.overview();
  }

  /** Kutucuğa ya da grafiğe tıklanınca açılan liste (ADR-142). */
  @Get('list')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @ZodResponse({ type: AdminListDto })
  list(@Query() query: AdminListQueryDto): Promise<AdminListResponse> {
    return this.lists.list(query);
  }
}

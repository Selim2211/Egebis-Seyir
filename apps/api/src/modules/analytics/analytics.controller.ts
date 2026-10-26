import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  AnalyticsCompareSchema,
  AnalyticsPeopleSchema,
  AnalyticsPersonSchema,
  AnalyticsProjectSchema,
  AnalyticsQuerySchema,
  WORKSPACE_PERMISSIONS as W,
  type AnalyticsCompare,
  type AnalyticsPeople,
  type AnalyticsPerson,
  type AnalyticsProject,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequirePermission } from '../auth/decorators';
import { AnalyticsService } from './analytics.service';

class QueryDto extends createZodDto(AnalyticsQuerySchema) {}
class PeopleDto extends createZodDto(AnalyticsPeopleSchema) {}
class PersonDto extends createZodDto(AnalyticsPersonSchema) {}
class ProjectDto extends createZodDto(AnalyticsProjectSchema) {}
class CompareDto extends createZodDto(AnalyticsCompareSchema) {}

/**
 * Kişi ve Proje analizi (ADR-143). Kişi, Proje ve karşılaştırma ekranları yalnızca Owner/Admin'e açıktır;
 * `person` ucunda üye yalnızca kendi analizini görebilir (servis denetler).
 */
@Controller('workspaces/:workspaceId/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('people')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @ZodResponse({ type: PeopleDto })
  people(@Query() query: QueryDto): Promise<AnalyticsPeople> {
    return this.analytics.people(query);
  }

  @Get('person/:userId')
  @ZodResponse({ type: PersonDto })
  person(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: QueryDto,
  ): Promise<AnalyticsPerson> {
    return this.analytics.person(userId, query);
  }

  @Get('project/:spaceId')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @ZodResponse({ type: ProjectDto })
  project(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Query() query: QueryDto,
  ): Promise<AnalyticsProject> {
    return this.analytics.project(spaceId, query);
  }

  @Get('compare')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @ZodResponse({ type: CompareDto })
  compare(@Query() query: QueryDto): Promise<AnalyticsCompare> {
    return this.analytics.compare(query);
  }
}

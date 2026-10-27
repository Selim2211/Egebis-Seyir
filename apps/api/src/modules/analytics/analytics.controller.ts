import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  AnalyticsCompareSchema,
  AnalyticsFlowSchema,
  AnalyticsPeopleSchema,
  AnalyticsPersonSchema,
  AnalyticsProjectSchema,
  AnalyticsQuerySchema,
  WORKSPACE_PERMISSIONS as W,
  type AnalyticsCompare,
  type AnalyticsFlow,
  type AnalyticsPeople,
  type AnalyticsPerson,
  type AnalyticsProject,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequirePermission } from '../auth/decorators';
import { AnalyticsFlowService } from './analytics-flow.service';
import { AnalyticsService } from './analytics.service';

class QueryDto extends createZodDto(AnalyticsQuerySchema) {}
class PeopleDto extends createZodDto(AnalyticsPeopleSchema) {}
class PersonDto extends createZodDto(AnalyticsPersonSchema) {}
class ProjectDto extends createZodDto(AnalyticsProjectSchema) {}
class CompareDto extends createZodDto(AnalyticsCompareSchema) {}
class FlowDto extends createZodDto(AnalyticsFlowSchema) {}

/**
 * Kişi ve Proje analizi (ADR-143). Kişi, Proje ve karşılaştırma ekranları yalnızca Owner/Admin'e açıktır;
 * `person` ucunda üye yalnızca kendi analizini görebilir (servis denetler).
 */
@Controller('workspaces/:workspaceId/analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly flow: AnalyticsFlowService,
  ) {}

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
  /** Akış ve darboğaz: bitirme süresi, durumlarda bekleme, WIP, yaşlanan işler (ADR-144). */
  @Get('flow')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @ZodResponse({ type: FlowDto })
  flowOf(@Query() query: QueryDto): Promise<AnalyticsFlow> {
    return this.flow.flow(query);
  }
}

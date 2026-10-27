import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  AnalyticsCapacityQuerySchema,
  AnalyticsCapacitySchema,
  AnalyticsCompareSchema,
  AnalyticsFlowSchema,
  AnalyticsPeopleSchema,
  AnalyticsPersonSchema,
  AnalyticsProjectSchema,
  AnalyticsQuerySchema,
  AnalyticsSprintsSchema,
  WORKSPACE_PERMISSIONS as W,
  type AnalyticsCapacity,
  type AnalyticsCompare,
  type AnalyticsFlow,
  type AnalyticsPeople,
  type AnalyticsPerson,
  type AnalyticsProject,
  type AnalyticsSprints,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequirePermission } from '../auth/decorators';
import { AnalyticsCapacityService } from './analytics-capacity.service';
import { AnalyticsFlowService } from './analytics-flow.service';
import { AnalyticsSprintService } from './analytics-sprint.service';
import { AnalyticsService } from './analytics.service';

class QueryDto extends createZodDto(AnalyticsQuerySchema) {}
class PeopleDto extends createZodDto(AnalyticsPeopleSchema) {}
class PersonDto extends createZodDto(AnalyticsPersonSchema) {}
class ProjectDto extends createZodDto(AnalyticsProjectSchema) {}
class CompareDto extends createZodDto(AnalyticsCompareSchema) {}
class FlowDto extends createZodDto(AnalyticsFlowSchema) {}
class SprintsDto extends createZodDto(AnalyticsSprintsSchema) {}
class CapacityQueryDto extends createZodDto(AnalyticsCapacityQuerySchema) {}
class CapacityDto extends createZodDto(AnalyticsCapacitySchema) {}

/**
 * Kişi ve Proje analizi (ADR-143). Kişi, Proje ve karşılaştırma ekranları yalnızca Owner/Admin'e açıktır;
 * `person` ucunda üye yalnızca kendi analizini görebilir (servis denetler).
 */
@Controller('workspaces/:workspaceId/analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly flow: AnalyticsFlowService,
    private readonly sprintStats: AnalyticsSprintService,
    private readonly capacityStats: AnalyticsCapacityService,
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

  /** Sprint derinliği: taahhüt, biten, kapsam değişimi ve devir (ADR-145). */
  @Get('sprints')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @ZodResponse({ type: SprintsDto })
  sprints(@Query() query: QueryDto): Promise<AnalyticsSprints> {
    return this.sprintStats.sprints(query);
  }

  /** İş yükü ve kapasite: kişi başı açık iş, kalan tahmin, doluluk ve ısı haritası (ADR-146). */
  @Get('capacity')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @ZodResponse({ type: CapacityDto })
  capacity(@Query() query: CapacityQueryDto): Promise<AnalyticsCapacity> {
    return this.capacityStats.capacity(query);
  }
}

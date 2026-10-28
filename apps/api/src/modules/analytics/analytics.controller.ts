import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  AnalyticsCapacityQuerySchema,
  AnalyticsCapacitySchema,
  AnalyticsCompareSchema,
  AnalyticsDigestSchema,
  AnalyticsDigestTestSchema,
  AnalyticsExportQuerySchema,
  AnalyticsFlowSchema,
  AnalyticsForecastSchema,
  AnalyticsPeopleSchema,
  AnalyticsPersonSchema,
  AnalyticsProjectSchema,
  AnalyticsQualitySchema,
  AnalyticsQuerySchema,
  AnalyticsSprintsSchema,
  UpdateAnalyticsDigestRequestSchema,
  WORKSPACE_PERMISSIONS as W,
  type AnalyticsCapacity,
  type AnalyticsCompare,
  type AnalyticsDigest,
  type AnalyticsDigestTest,
  type AnalyticsFlow,
  type AnalyticsForecast,
  type AnalyticsPeople,
  type AnalyticsPerson,
  type AnalyticsProject,
  type AnalyticsQuality,
  type AnalyticsSprints,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import type { Response } from 'express';
import { CurrentUser, RequirePermission } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.constants';
import { AnalyticsCapacityService } from './analytics-capacity.service';
import { AnalyticsDigestService } from './analytics-digest.service';
import { AnalyticsExportService } from './analytics-export.service';
import { AnalyticsFlowService } from './analytics-flow.service';
import { AnalyticsForecastService } from './analytics-forecast.service';
import { AnalyticsQualityService } from './analytics-quality.service';
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
class QualityDto extends createZodDto(AnalyticsQualitySchema) {}
class ForecastDto extends createZodDto(AnalyticsForecastSchema) {}
class DigestDto extends createZodDto(AnalyticsDigestSchema) {}
class ExportQueryDto extends createZodDto(AnalyticsExportQuerySchema) {}
class UpdateDigestDto extends createZodDto(UpdateAnalyticsDigestRequestSchema) {}
class DigestTestDto extends createZodDto(AnalyticsDigestTestSchema) {}

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
    private readonly qualityStats: AnalyticsQualityService,
    private readonly forecastStats: AnalyticsForecastService,
    private readonly digest: AnalyticsDigestService,
    private readonly exporter: AnalyticsExportService,
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

  /** Kalite ve destek: Bug eğrisi, çözüm süresi, firma ve atama doğruluğu (ADR-147). */
  @Get('quality')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @ZodResponse({ type: QualityDto })
  quality(@Query() query: QueryDto): Promise<AnalyticsQuality> {
    return this.qualityStats.quality(query);
  }

  /** Öngörü ve risk uyarıları: sprint/Epic tahmini bitiş, yavaşlama, bekleyen kritik Bug (ADR-148). */
  @Get('forecast')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @ZodResponse({ type: ForecastDto })
  forecast(): Promise<AnalyticsForecast> {
    return this.forecastStats.forecast();
  }

  /** Haftalık özet e-postası ayarı (ADR-149). */
  @Get('digest')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @ZodResponse({ type: DigestDto })
  digestSettings(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<AnalyticsDigest> {
    return this.digest.get(workspaceId);
  }

  @Put('digest')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @ZodResponse({ type: DigestDto })
  setDigest(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() body: UpdateDigestDto,
  ): Promise<AnalyticsDigest> {
    return this.digest.set(workspaceId, body.enabled);
  }

  /** Özet yalnızca isteği yapana gönderilir. */
  @Post('digest/test')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ type: DigestTestDto })
  digestTest(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<AnalyticsDigestTest> {
    return this.digest.sendTest(workspaceId, user.id);
  }

  /** Ekrandaki sekmenin verisini Excel olarak indirir (ADR-149). Kişi dışındaki sekmeler yalnızca Owner/Admin. */
  @Get('export')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Cache-Control', 'private, no-store')
  async export(
    @Query() query: ExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { filename, buffer } = await this.exporter.build(query);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="analiz.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    return new StreamableFile(buffer);
  }
}

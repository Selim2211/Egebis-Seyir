import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsCapacityService } from './analytics-capacity.service';
import { AnalyticsDigestService } from './analytics-digest.service';
import { AnalyticsExportService } from './analytics-export.service';
import { AnalyticsFlowService } from './analytics-flow.service';
import { AnalyticsForecastService } from './analytics-forecast.service';
import { AnalyticsQualityService } from './analytics-quality.service';
import { AnalyticsSprintService } from './analytics-sprint.service';
import { AnalyticsService } from './analytics.service';

/** Kişi ve Proje analizi (ADR-143). */
@Module({
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    AnalyticsFlowService,
    AnalyticsSprintService,
    AnalyticsCapacityService,
    AnalyticsQualityService,
    AnalyticsForecastService,
    AnalyticsDigestService,
    AnalyticsExportService,
  ],
})
export class AnalyticsModule {}

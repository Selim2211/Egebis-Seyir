import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsCapacityService } from './analytics-capacity.service';
import { AnalyticsFlowService } from './analytics-flow.service';
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
  ],
})
export class AnalyticsModule {}

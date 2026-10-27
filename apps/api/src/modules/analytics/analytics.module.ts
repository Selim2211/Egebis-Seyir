import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsFlowService } from './analytics-flow.service';
import { AnalyticsService } from './analytics.service';

/** Kişi ve Proje analizi (ADR-143). */
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsFlowService],
})
export class AnalyticsModule {}

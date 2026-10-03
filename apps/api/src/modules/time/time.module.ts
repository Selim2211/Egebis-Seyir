import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { FlowService } from './flow.service';
import { TimeController } from './time.controller';
import { TimeService } from './time.service';
import { WorkloadService } from './workload.service';

/** Zaman takibi: sayaç, elle giriş, zaman çizelgesi (Faz 4.3). */
@Module({
  controllers: [TimeController],
  providers: [TimeService, WorkloadService, FlowService, DashboardService],
})
export class TimeModule {}

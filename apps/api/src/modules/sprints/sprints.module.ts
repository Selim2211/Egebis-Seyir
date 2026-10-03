import { Module } from '@nestjs/common';
import { WorkItemsModule } from '../work-items/work-items.module';
import { BacklogService } from './backlog.service';
import { RetroService } from './retro.service';
import { SprintLifecycleService } from './sprint-lifecycle.service';
import { SprintReportsService } from './sprint-reports.service';
import { SprintsController } from './sprints.controller';
import { SprintsService } from './sprints.service';

/** Sprint'ler, Product Backlog, yaşam döngüsü ve raporlar (Faz 2). */
@Module({
  imports: [WorkItemsModule],
  controllers: [SprintsController],
  providers: [
    SprintsService,
    BacklogService,
    SprintLifecycleService,
    SprintReportsService,
    RetroService,
  ],
})
export class SprintsModule {}

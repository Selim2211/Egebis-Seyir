import { Module } from '@nestjs/common';
import { WorkItemsModule } from '../work-items/work-items.module';
import { CsvModule } from '../import-export/csv.module';
import { SprintExcelService } from './sprint-excel.service';
import { BacklogService } from './backlog.service';
import { RetroService } from './retro.service';
import { SprintLifecycleService } from './sprint-lifecycle.service';
import { SprintReportsService } from './sprint-reports.service';
import { SprintsController } from './sprints.controller';
import { SprintsService } from './sprints.service';

/** Sprint'ler, Product Backlog, yaşam döngüsü ve raporlar (Faz 2). */
@Module({
  imports: [WorkItemsModule, CsvModule],
  controllers: [SprintsController],
  providers: [
    SprintExcelService,
    SprintsService,
    BacklogService,
    SprintLifecycleService,
    SprintReportsService,
    RetroService,
  ],
  exports: [SprintsService],
})
export class SprintsModule {}

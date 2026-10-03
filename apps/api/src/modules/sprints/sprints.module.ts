import { Module } from '@nestjs/common';
import { BacklogService } from './backlog.service';
import { SprintLifecycleService } from './sprint-lifecycle.service';
import { SprintReportsService } from './sprint-reports.service';
import { SprintsController } from './sprints.controller';
import { SprintsService } from './sprints.service';

/** Sprint'ler, Product Backlog, yaşam döngüsü ve raporlar (Faz 2). */
@Module({
  controllers: [SprintsController],
  providers: [SprintsService, BacklogService, SprintLifecycleService, SprintReportsService],
})
export class SprintsModule {}

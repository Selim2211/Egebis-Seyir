import { Module } from '@nestjs/common';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { BugsService } from './bugs.service';
import { EpicsService } from './epics.service';
import { GanttService } from './gantt.service';
import { ItemDetailsService } from './item-details.service';
import { ItemQueriesService } from './item-queries.service';
import { ItemTreeService } from './item-tree.service';
import { LabelsService } from './labels.service';
import { ProjectMapService } from './project-map.service';
import { RecurrenceService } from './recurrence.service';
import { WorkItemsController } from './work-items.controller';
import { WorkItemsService } from './work-items.service';

/** İş öğeleri: Epic/Task/Sub-task/Bug, etiketler, taşıma/kopyalama, arşiv/çöp (Faz 1.3). */
@Module({
  imports: [CustomFieldsModule],
  controllers: [WorkItemsController],
  providers: [
    WorkItemsService,
    BugsService,
    EpicsService,
    GanttService,
    ProjectMapService,
    ItemTreeService,
    ItemDetailsService,
    ItemQueriesService,
    LabelsService,
    RecurrenceService,
  ],
  exports: [WorkItemsService, ItemDetailsService],
})
export class WorkItemsModule {}

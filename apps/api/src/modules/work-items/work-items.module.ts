import { Module } from '@nestjs/common';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { EpicsService } from './epics.service';
import { GanttService } from './gantt.service';
import { ItemDetailsService } from './item-details.service';
import { ItemQueriesService } from './item-queries.service';
import { ItemTreeService } from './item-tree.service';
import { LabelsService } from './labels.service';
import { RecurrenceService } from './recurrence.service';
import { WorkItemsController } from './work-items.controller';
import { WorkItemsService } from './work-items.service';

/** İş öğeleri: Epic/Story/Task/Sub-task/Bug, etiketler, taşıma/kopyalama, arşiv/çöp (Faz 1.3). */
@Module({
  imports: [CustomFieldsModule],
  controllers: [WorkItemsController],
  providers: [
    WorkItemsService,
    EpicsService,
    GanttService,
    ItemTreeService,
    ItemDetailsService,
    ItemQueriesService,
    LabelsService,
    RecurrenceService,
  ],
  exports: [WorkItemsService],
})
export class WorkItemsModule {}

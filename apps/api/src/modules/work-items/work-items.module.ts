import { Module } from '@nestjs/common';
import { EpicsService } from './epics.service';
import { ItemDetailsService } from './item-details.service';
import { ItemQueriesService } from './item-queries.service';
import { ItemTreeService } from './item-tree.service';
import { LabelsService } from './labels.service';
import { WorkItemsController } from './work-items.controller';
import { WorkItemsService } from './work-items.service';

/** İş öğeleri: Epic/Story/Task/Sub-task/Bug, etiketler, taşıma/kopyalama, arşiv/çöp (Faz 1.3). */
@Module({
  controllers: [WorkItemsController],
  providers: [
    WorkItemsService,
    EpicsService,
    ItemTreeService,
    ItemDetailsService,
    ItemQueriesService,
    LabelsService,
  ],
  exports: [WorkItemsService],
})
export class WorkItemsModule {}

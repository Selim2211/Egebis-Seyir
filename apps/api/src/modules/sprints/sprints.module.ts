import { Module } from '@nestjs/common';
import { BacklogService } from './backlog.service';
import { SprintLifecycleService } from './sprint-lifecycle.service';
import { SprintsController } from './sprints.controller';
import { SprintsService } from './sprints.service';

/** Sprint'ler ve Product Backlog (Faz 2.1). Başlat/tamamla/planning: 2.3. */
@Module({
  controllers: [SprintsController],
  providers: [SprintsService, BacklogService, SprintLifecycleService],
})
export class SprintsModule {}

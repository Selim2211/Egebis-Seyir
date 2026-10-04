import { Module } from '@nestjs/common';
import { WorkItemsModule } from '../work-items/work-items.module';
import { AutomationsController } from './automations.controller';
import { AutomationsService } from './automations.service';

/** Otomasyonlar (Faz 5.6). */
@Module({
  imports: [WorkItemsModule],
  controllers: [AutomationsController],
  providers: [AutomationsService],
})
export class AutomationsModule {}

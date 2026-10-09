import { Module } from '@nestjs/common';
import { WorkItemsModule } from '../work-items/work-items.module';
import { CsvController } from './csv.controller';
import { CsvService } from './csv.service';

/** CSV içe/dışa aktarma (Faz 5.7). */
@Module({
  imports: [WorkItemsModule],
  controllers: [CsvController],
  providers: [CsvService],
  exports: [CsvService],
})
export class CsvModule {}

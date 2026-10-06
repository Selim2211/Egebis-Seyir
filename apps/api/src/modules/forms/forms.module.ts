import { Module } from '@nestjs/common';
import { WorkItemsModule } from '../work-items/work-items.module';
import { FormsController } from './forms.controller';
import { FormsService } from './forms.service';

/** Formlar (Faz 7.4): Space üyelerinin görev açma formları. */
@Module({
  imports: [WorkItemsModule],
  controllers: [FormsController],
  providers: [FormsService],
})
export class FormsModule {}

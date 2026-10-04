import { Module } from '@nestjs/common';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { DocsModule } from '../docs/docs.module';
import { SpacesModule } from '../spaces/spaces.module';
import { SprintsModule } from '../sprints/sprints.module';
import { WorkItemsModule } from '../work-items/work-items.module';
import { TemplatesController, WorkspaceTemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

/** Şablonlar (Faz 5.5). */
@Module({
  imports: [WorkItemsModule, SpacesModule, SprintsModule, DocsModule, CustomFieldsModule],
  controllers: [TemplatesController, WorkspaceTemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}

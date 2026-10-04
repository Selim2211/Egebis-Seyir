import { Module } from '@nestjs/common';
import { SavedViewsController } from './saved-views.controller';
import { SavedViewsService } from './saved-views.service';

/** Kayıtlı görünümler (Faz 5.1). */
@Module({
  controllers: [SavedViewsController],
  providers: [SavedViewsService],
})
export class ViewsModule {}

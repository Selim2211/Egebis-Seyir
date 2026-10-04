import { Module } from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { LifecycleService } from './lifecycle.service';
import { SpaceMembersService } from './space-members.service';
import {
  FoldersController,
  ListsController,
  SpacesController,
  WorkspaceStructureController,
} from './spaces.controller';
import { SpacesService } from './spaces.service';
import { StatusesService } from './statuses.service';
import { StructureService } from './structure.service';

/** Space / Folder / List hiyerarşisi, favoriler, arşiv ve çöp kutusu (Faz 1.2). */
@Module({
  controllers: [WorkspaceStructureController, SpacesController, FoldersController, ListsController],
  providers: [
    SpacesService,
    SpaceMembersService,
    StructureService,
    FavoritesService,
    LifecycleService,
    StatusesService,
  ],
})
export class SpacesModule {}

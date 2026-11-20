import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { BackupModule } from '../backup/backup.module';
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
import { SpaceIconService } from './space-icon.service';
import { StatusesService } from './statuses.service';
import { StructureService } from './structure.service';

/** Space / Folder / List hiyerarşisi, favoriler, arşiv ve çöp kutusu (Faz 1.2). */
@Module({
  imports: [MulterModule.register({ storage: memoryStorage() }), BackupModule],
  controllers: [WorkspaceStructureController, SpacesController, FoldersController, ListsController],
  providers: [
    SpacesService,
    SpaceMembersService,
    StructureService,
    FavoritesService,
    LifecycleService,
    StatusesService,
    SpaceIconService,
  ],
  exports: [SpacesService, StructureService],
})
export class SpacesModule {}

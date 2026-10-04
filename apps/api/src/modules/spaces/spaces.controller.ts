import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ArchiveResponseSchema,
  CreatedSchema,
  CreateListRequestSchema,
  CreateSpaceRequestSchema,
  CreateStatusRequestSchema,
  FavoriteTypeParamSchema,
  FolderDetailSchema,
  HierarchyResponseSchema,
  ListDetailSchema,
  MoveListRequestSchema,
  MoveRequestSchema,
  NameRequestSchema,
  PutSpaceMemberRequestSchema,
  SPACE_PERMISSIONS as S,
  SpaceDetailSchema,
  SpaceMembersResponseSchema,
  UpdateSpaceRequestSchema,
  UpdateStatusRequestSchema,
  WORKSPACE_PERMISSIONS as W,
  type ArchiveResponse,
  type Created,
  type FavoriteType,
  type FolderDetail,
  type HierarchyResponse,
  type ListDetail,
  type SpaceDetail,
  type SpaceMembersResponse,
} from '@scrum/shared';
import { createZodDto, ZodResponse, ZodValidationPipe } from 'nestjs-zod';
import { RequirePermission, RequireSpacePermission } from '../auth/decorators';
import { FavoritesService } from './favorites.service';
import { LifecycleService } from './lifecycle.service';
import { SpaceMembersService } from './space-members.service';
import { SpacesService } from './spaces.service';
import { StatusesService } from './statuses.service';
import { StructureService } from './structure.service';

class HierarchyDto extends createZodDto(HierarchyResponseSchema) {}
class CreateSpaceDto extends createZodDto(CreateSpaceRequestSchema) {}
class UpdateSpaceDto extends createZodDto(UpdateSpaceRequestSchema) {}
class CreateStatusDto extends createZodDto(CreateStatusRequestSchema) {}
class UpdateStatusDto extends createZodDto(UpdateStatusRequestSchema) {}
class SpaceDetailDto extends createZodDto(SpaceDetailSchema) {}
class CreatedDto extends createZodDto(CreatedSchema) {}
class MoveDto extends createZodDto(MoveRequestSchema) {}
class MoveListDto extends createZodDto(MoveListRequestSchema) {}
class NameDto extends createZodDto(NameRequestSchema) {}
class CreateListDto extends createZodDto(CreateListRequestSchema) {}
class FolderDetailDto extends createZodDto(FolderDetailSchema) {}
class ListDetailDto extends createZodDto(ListDetailSchema) {}
class SpaceMembersDto extends createZodDto(SpaceMembersResponseSchema) {}
class PutSpaceMemberDto extends createZodDto(PutSpaceMemberRequestSchema) {}
class ArchiveDto extends createZodDto(ArchiveResponseSchema) {}

const Uuid = (name: string) => Param(name, ParseUUIDPipe);

/** Kenar çubuğu, favoriler, arşiv (workspace düzeyi). */
@Controller('workspaces/:workspaceId')
export class WorkspaceStructureController {
  constructor(
    private readonly spaces: SpacesService,
    private readonly favorites: FavoritesService,
    private readonly lifecycle: LifecycleService,
  ) {}

  @Get('hierarchy')
  @ZodResponse({ type: HierarchyDto })
  hierarchy(): Promise<HierarchyResponse> {
    return this.spaces.hierarchy();
  }

  @Put('favorites/:type/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async addFavorite(
    @Param('type', new ZodValidationPipe(FavoriteTypeParamSchema)) type: FavoriteType,
    @Uuid('id') id: string,
  ): Promise<void> {
    await this.favorites.add(type, id);
  }

  @Delete('favorites/:type/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFavorite(
    @Param('type', new ZodValidationPipe(FavoriteTypeParamSchema)) type: FavoriteType,
    @Uuid('id') id: string,
  ): Promise<void> {
    await this.favorites.remove(type, id);
  }

  @Get('archive')
  @ZodResponse({ type: ArchiveDto })
  archive(): Promise<ArchiveResponse> {
    return this.lifecycle.list();
  }
}

@Controller('workspaces/:workspaceId/spaces')
export class SpacesController {
  constructor(
    private readonly spaces: SpacesService,
    private readonly members: SpaceMembersService,
    private readonly structure: StructureService,
    private readonly lifecycle: LifecycleService,
    private readonly statuses: StatusesService,
  ) {}

  @Post()
  @RequirePermission(W.SPACE_CREATE)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  create(@Body() body: CreateSpaceDto): Promise<Created> {
    return this.spaces.create(body);
  }

  @Get(':spaceId')
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: SpaceDetailDto })
  detail(@Uuid('spaceId') spaceId: string): Promise<SpaceDetail> {
    return this.spaces.detail(spaceId);
  }

  @Patch(':spaceId')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(@Uuid('spaceId') spaceId: string, @Body() body: UpdateSpaceDto): Promise<void> {
    await this.spaces.update(spaceId, body);
  }

  /** Space'lerin ortak sırası yalnızca Owner/Admin tarafından değişir (ADR-040). */
  @Post(':spaceId/move')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async move(@Uuid('spaceId') spaceId: string, @Body() body: MoveDto): Promise<void> {
    await this.spaces.move(spaceId, body.afterId);
  }

  @Post(':spaceId/archive')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Uuid('spaceId') spaceId: string): Promise<void> {
    await this.lifecycle.change('SPACE', spaceId, 'archive');
  }

  @Post(':spaceId/unarchive')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async unarchive(@Uuid('spaceId') spaceId: string): Promise<void> {
    await this.lifecycle.change('SPACE', spaceId, 'unarchive');
  }

  @Delete(':spaceId')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async trash(@Uuid('spaceId') spaceId: string): Promise<void> {
    await this.lifecycle.change('SPACE', spaceId, 'delete');
  }

  @Post(':spaceId/restore')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async restore(@Uuid('spaceId') spaceId: string): Promise<void> {
    await this.lifecycle.change('SPACE', spaceId, 'restore');
  }

  // ---------- Üyeler ----------

  @Get(':spaceId/members')
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: SpaceMembersDto })
  async listMembers(@Uuid('spaceId') spaceId: string): Promise<SpaceMembersResponse> {
    return { members: await this.members.list(spaceId) };
  }

  @Put(':spaceId/members/:userId')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async putMember(
    @Uuid('spaceId') spaceId: string,
    @Uuid('userId') userId: string,
    @Body() body: PutSpaceMemberDto,
  ): Promise<void> {
    await this.members.put(spaceId, userId, body.role);
  }

  @Delete(':spaceId/members/:userId')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Uuid('spaceId') spaceId: string,
    @Uuid('userId') userId: string,
  ): Promise<void> {
    await this.members.remove(spaceId, userId);
  }

  // ---------- Durumlar ----------

  @Post(':spaceId/statuses')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  createStatus(@Uuid('spaceId') spaceId: string, @Body() body: CreateStatusDto): Promise<Created> {
    return this.statuses.create(spaceId, body);
  }

  @Post(':spaceId/statuses/:statusId/move')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async moveStatus(
    @Uuid('spaceId') spaceId: string,
    @Uuid('statusId') statusId: string,
    @Body() body: MoveDto,
  ): Promise<void> {
    await this.statuses.move(spaceId, statusId, body.afterId);
  }

  @Delete(':spaceId/statuses/:statusId')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeStatus(
    @Uuid('spaceId') spaceId: string,
    @Uuid('statusId') statusId: string,
    @Query('moveTo', new ParseUUIDPipe({ optional: true })) moveTo?: string,
  ): Promise<void> {
    await this.statuses.remove(spaceId, statusId, moveTo);
  }

  @Patch(':spaceId/statuses/:statusId')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateStatus(
    @Uuid('spaceId') spaceId: string,
    @Uuid('statusId') statusId: string,
    @Body() body: UpdateStatusDto,
  ): Promise<void> {
    await this.statuses.update(spaceId, statusId, body);
  }

  // ---------- Folder / List oluşturma ----------

  @Post(':spaceId/folders')
  @RequireSpacePermission(S.LIST_MANAGE)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  createFolder(@Uuid('spaceId') spaceId: string, @Body() body: NameDto): Promise<Created> {
    return this.structure.createFolder(spaceId, body.name);
  }

  @Post(':spaceId/lists')
  @RequireSpacePermission(S.LIST_MANAGE)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  createList(@Uuid('spaceId') spaceId: string, @Body() body: CreateListDto): Promise<Created> {
    return this.structure.createList(spaceId, body.name, body.folderId);
  }
}

@Controller('workspaces/:workspaceId/folders/:folderId')
export class FoldersController {
  constructor(
    private readonly structure: StructureService,
    private readonly lifecycle: LifecycleService,
  ) {}

  @Get()
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: FolderDetailDto })
  detail(@Uuid('folderId') folderId: string): Promise<FolderDetail> {
    return this.structure.folder(folderId);
  }

  @Patch()
  @RequireSpacePermission(S.LIST_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async rename(@Uuid('folderId') folderId: string, @Body() body: NameDto): Promise<void> {
    await this.structure.renameFolder(folderId, body.name);
  }

  @Post('move')
  @RequireSpacePermission(S.LIST_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async move(@Uuid('folderId') folderId: string, @Body() body: MoveDto): Promise<void> {
    await this.structure.moveFolder(folderId, body.afterId);
  }

  @Post('archive')
  @RequireSpacePermission(S.LIST_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Uuid('folderId') folderId: string): Promise<void> {
    await this.lifecycle.change('FOLDER', folderId, 'archive');
  }

  @Post('unarchive')
  @RequireSpacePermission(S.LIST_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async unarchive(@Uuid('folderId') folderId: string): Promise<void> {
    await this.lifecycle.change('FOLDER', folderId, 'unarchive');
  }

  @Delete()
  @RequireSpacePermission(S.LIST_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async trash(@Uuid('folderId') folderId: string): Promise<void> {
    await this.lifecycle.change('FOLDER', folderId, 'delete');
  }

  @Post('restore')
  @RequireSpacePermission(S.LIST_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async restore(@Uuid('folderId') folderId: string): Promise<void> {
    await this.lifecycle.change('FOLDER', folderId, 'restore');
  }
}

@Controller('workspaces/:workspaceId/lists/:listId')
export class ListsController {
  constructor(
    private readonly structure: StructureService,
    private readonly lifecycle: LifecycleService,
  ) {}

  @Get()
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: ListDetailDto })
  detail(@Uuid('listId') listId: string): Promise<ListDetail> {
    return this.structure.list(listId);
  }

  @Patch()
  @RequireSpacePermission(S.LIST_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async rename(@Uuid('listId') listId: string, @Body() body: NameDto): Promise<void> {
    await this.structure.renameList(listId, body.name);
  }

  @Post('move')
  @RequireSpacePermission(S.LIST_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async move(@Uuid('listId') listId: string, @Body() body: MoveListDto): Promise<void> {
    await this.structure.moveList(listId, body.folderId, body.afterId);
  }

  @Post('archive')
  @RequireSpacePermission(S.LIST_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Uuid('listId') listId: string): Promise<void> {
    await this.lifecycle.change('LIST', listId, 'archive');
  }

  @Post('unarchive')
  @RequireSpacePermission(S.LIST_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async unarchive(@Uuid('listId') listId: string): Promise<void> {
    await this.lifecycle.change('LIST', listId, 'unarchive');
  }

  @Delete()
  @RequireSpacePermission(S.LIST_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async trash(@Uuid('listId') listId: string): Promise<void> {
    await this.lifecycle.change('LIST', listId, 'delete');
  }

  @Post('restore')
  @RequireSpacePermission(S.LIST_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async restore(@Uuid('listId') listId: string): Promise<void> {
    await this.lifecycle.change('LIST', listId, 'restore');
  }
}

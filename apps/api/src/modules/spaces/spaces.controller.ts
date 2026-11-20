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
  Header,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
  ProjectRolesResponseSchema,
  PutBugSendersRequestSchema,
  PutProjectRoleRequestSchema,
  PutScrumRolesRequestSchema,
  type ProjectRolesResponse,
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
  OutsourceAccessResponseSchema,
  PutOutsourceAccessRequestSchema,
  type OutsourceAccessResponse,
  MAX_SPACE_ICON_BYTES,
} from '@scrum/shared';
import { createZodDto, ZodResponse, ZodValidationPipe } from 'nestjs-zod';
import { RequirePermission, RequireSpacePermission } from '../auth/decorators';
import { FavoritesService } from './favorites.service';
import { LifecycleService } from './lifecycle.service';
import { SpaceMembersService } from './space-members.service';
import { SpacesService } from './spaces.service';
import { SpaceIconService } from './space-icon.service';
import { BackupService } from '../backup/backup.service';
import { StatusesService } from './statuses.service';
import { StructureService } from './structure.service';
import { parseRemoveBody } from '../access/remove-body';

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
class OutsourceAccessDto extends createZodDto(OutsourceAccessResponseSchema) {}
class PutOutsourceAccessDto extends createZodDto(PutOutsourceAccessRequestSchema) {}
class SpaceMembersDto extends createZodDto(SpaceMembersResponseSchema) {}
class PutSpaceMemberDto extends createZodDto(PutSpaceMemberRequestSchema) {}
class ProjectRolesDto extends createZodDto(ProjectRolesResponseSchema) {}
class PutScrumRolesDto extends createZodDto(PutScrumRolesRequestSchema) {}
class PutBugSendersDto extends createZodDto(PutBugSendersRequestSchema) {}
class PutProjectRoleDto extends createZodDto(PutProjectRoleRequestSchema) {}
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
    private readonly icons: SpaceIconService,
    private readonly backup: BackupService,
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

  /** Proje ikonu resmi (ADR-176): PNG/JPEG/WebP, en çok 1 MB; yeni sürüm döner. */
  @Post(':spaceId/icon')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_SPACE_ICON_BYTES, files: 1 } }),
  )
  @HttpCode(HttpStatus.OK)
  async uploadIcon(
    @Uuid('spaceId') spaceId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ version: string }> {
    return { version: await this.icons.set(spaceId, file) };
  }

  @Delete(':spaceId/icon')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeIcon(@Uuid('spaceId') spaceId: string): Promise<void> {
    await this.icons.clear(spaceId);
  }

  /** Sürüm adreste olduğu için tarayıcı uzun süre önbelleğe alabilir. */
  @Get(':spaceId/icon')
  @RequireSpacePermission(S.SPACE_VIEW)
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  @Header('Cache-Control', 'private, max-age=86400')
  icon(@Uuid('spaceId') spaceId: string): Promise<StreamableFile> {
    return this.icons.open(spaceId);
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
    // İçerik sıkıştırılıp canlı tablolardan kalkar (ADR-176).
    await this.backup.freezeSpace(spaceId);
  }

  @Post(':spaceId/unarchive')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async unarchive(@Uuid('spaceId') spaceId: string): Promise<void> {
    // Önce içerik geri açılır; başarısız olursa Proje arşivde kalır (ADR-176).
    await this.backup.thawSpace(spaceId);
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
    @Body() body: unknown,
  ): Promise<void> {
    await this.members.remove(spaceId, userId, parseRemoveBody(body));
  }

  // ---------- Dış kaynak yetkisi (ADR-172) ----------

  @Get(':spaceId/outsource-access')
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: OutsourceAccessDto })
  outsourceAccess(@Uuid('spaceId') spaceId: string): Promise<OutsourceAccessResponse> {
    return this.members.outsourceAccess(spaceId);
  }

  @Put(':spaceId/outsource-access/:userId')
  @RequireSpacePermission(S.SPACE_VIEW)
  @HttpCode(HttpStatus.NO_CONTENT)
  async putOutsourceAccess(
    @Uuid('spaceId') spaceId: string,
    @Uuid('userId') userId: string,
    @Body() body: PutOutsourceAccessDto,
  ): Promise<void> {
    await this.members.putOutsourceAccess(spaceId, userId, body);
  }

  @Put(':spaceId/scrum-roles')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async putScrumRoles(
    @Uuid('spaceId') spaceId: string,
    @Body() body: PutScrumRolesDto,
  ): Promise<void> {
    await this.members.putScrumRoles(spaceId, body);
  }

  @Put(':spaceId/bug-senders')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async putBugSenders(
    @Uuid('spaceId') spaceId: string,
    @Body() body: PutBugSendersDto,
  ): Promise<void> {
    await this.members.putBugSenders(spaceId, body);
  }

  // ---------- Proje bazında rol ayarı (ADR-161) ----------

  @Get(':spaceId/role-permissions')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @ZodResponse({ type: ProjectRolesDto })
  async roleSettings(@Uuid('spaceId') spaceId: string): Promise<ProjectRolesResponse> {
    return this.members.roleSettings(spaceId);
  }

  @Put(':spaceId/role-permissions')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async putRoleSetting(
    @Uuid('spaceId') spaceId: string,
    @Body() body: PutProjectRoleDto,
  ): Promise<void> {
    await this.members.putRoleSetting(spaceId, body);
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

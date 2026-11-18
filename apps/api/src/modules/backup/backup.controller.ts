import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  RestoreResultSchema,
  SPACE_PERMISSIONS as S,
  SpaceRestoreFieldsSchema,
  SpaceRollbackFieldsSchema,
  SprintRestoreFieldsSchema,
  WORKSPACE_PERMISSIONS as W,
  type RestoreResult,
} from '@scrum/shared';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequirePermission, RequireSpacePermission } from '../auth/decorators';
import { BackupService } from './backup.service';

class SpaceRestoreFieldsDto extends createZodDto(SpaceRestoreFieldsSchema) {}
class SpaceRollbackFieldsDto extends createZodDto(SpaceRollbackFieldsSchema) {}
class SprintRestoreFieldsDto extends createZodDto(SprintRestoreFieldsSchema) {}
class RestoreResultDto extends createZodDto(RestoreResultSchema) {}

const Uuid = (name: string) => Param(name, ParseUUIDPipe);
const disposition = (name: string) =>
  `attachment; filename="backup.zip.enc"; filename*=UTF-8''${encodeURIComponent(name)}.zip.enc`;

/**
 * Space ve Sprint yedeği / geri yükleme (Faz 8.5, ADR-105). Yedek ZIP'tir ve indirilirken AES-256-GCM
 * ile şifrelenir (`.zip.enc`, ADR-171); eski şifresiz ZIP'ler yine geri yüklenebilir.
 */
@Controller('workspaces/:workspaceId')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Get('spaces/:spaceId/backup.zip')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @Header('Content-Type', 'application/octet-stream')
  @Header('Cache-Control', 'private, no-store')
  async backupSpace(
    @Uuid('spaceId') spaceId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { name, file } = await this.backup.backupSpace(spaceId);
    res.setHeader('Content-Disposition', disposition(name));
    return new StreamableFile(file);
  }

  @Get('sprints/:sprintId/backup.zip')
  @RequireSpacePermission(S.SPRINT_PLAN)
  @Header('Content-Type', 'application/octet-stream')
  @Header('Cache-Control', 'private, no-store')
  async backupSprint(
    @Uuid('sprintId') sprintId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { name, file } = await this.backup.backupSprint(sprintId);
    res.setHeader('Content-Disposition', disposition(name));
    return new StreamableFile(file);
  }

  /** Yedekten yeni Space: yalnız Sahip/Yönetici. */
  @Post('restore/space')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @UseInterceptors(FileInterceptor('file'))
  @ZodResponse({ type: RestoreResultDto })
  restoreSpace(
    @Body() fields: SpaceRestoreFieldsDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<RestoreResult> {
    return this.backup.restoreSpace(file?.buffer, fields);
  }

  /** Projeyi yedeğin alındığı ana döndürür (yalnız Super Admin, ADR-173). */
  @Post('spaces/:spaceId/rollback')
  @HttpCode(HttpStatus.OK)
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @UseInterceptors(FileInterceptor('file'))
  @ZodResponse({ type: RestoreResultDto })
  rollbackSpace(
    @Uuid('spaceId') spaceId: string,
    @Body() fields: SpaceRollbackFieldsDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<RestoreResult> {
    return this.backup.rollbackSpace(spaceId, file?.buffer, fields);
  }

  /** Sprint yedeğini bu Space'e yeni sprint olarak ekler. */
  @Post('spaces/:spaceId/restore/sprint')
  @HttpCode(HttpStatus.OK)
  @RequireSpacePermission(S.SPRINT_PLAN)
  @UseInterceptors(FileInterceptor('file'))
  @ZodResponse({ type: RestoreResultDto })
  restoreSprint(
    @Uuid('spaceId') spaceId: string,
    @Body() fields: SprintRestoreFieldsDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<RestoreResult> {
    return this.backup.restoreSprint(spaceId, file?.buffer, fields);
  }
}

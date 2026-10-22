import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  CreatedSchema,
  CreateVideoFolderRequestSchema,
  CreateVideoRequestSchema,
  SPACE_PERMISSIONS as S,
  UpdateVideoFolderRequestSchema,
  UpdateVideoRequestSchema,
  VideoProgressSchema,
  VideosResponseSchema,
  type Created,
  type VideoProgress,
  type VideosResponse,
} from '@scrum/shared';
import type { Request, Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequireSpacePermission } from '../auth/decorators';
import { StorageService } from '../../infra/storage/storage.service';
import { parseRange } from './range';
import { VideosService } from './videos.service';

class VideosDto extends createZodDto(VideosResponseSchema) {}
class CreateVideoDto extends createZodDto(CreateVideoRequestSchema) {}
class UpdateVideoDto extends createZodDto(UpdateVideoRequestSchema) {}
class ProgressDto extends createZodDto(VideoProgressSchema) {}
class CreateFolderDto extends createZodDto(CreateVideoFolderRequestSchema) {}
class UpdateFolderDto extends createZodDto(UpdateVideoFolderRequestSchema) {}
class CreatedDto extends createZodDto(CreatedSchema) {}

const Uuid = (name: string) => Param(name, ParseUUIDPipe);
const NO_CONTENT = HttpStatus.NO_CONTENT;

/** Video arşivi (Faz 15, ADR-129). Görme `doc.view`, yükleme/düzenleme `doc.write`. */
@Controller('workspaces/:workspaceId')
export class VideosController {
  constructor(
    private readonly videos: VideosService,
    private readonly storage: StorageService,
  ) {}

  @Get('spaces/:spaceId/videos')
  @RequireSpacePermission(S.DOC_VIEW)
  @ZodResponse({ type: VideosDto })
  list(@Uuid('spaceId') spaceId: string): Promise<VideosResponse> {
    return this.videos.list(spaceId);
  }

  /** Yüklemeyi başlatır; dosya ardından parça parça `content` ucuna gönderilir. */
  @Post('spaces/:spaceId/videos')
  @RequireSpacePermission(S.DOC_WRITE)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  create(@Uuid('spaceId') spaceId: string, @Body() body: CreateVideoDto): Promise<Created> {
    return this.videos.create(spaceId, body);
  }

  /** Bir parça (application/octet-stream gövde): bellekte tutulmadan diske eklenir. */
  @Put('videos/:videoId/content')
  @RequireSpacePermission(S.DOC_WRITE)
  @ZodResponse({ type: ProgressDto })
  appendChunk(
    @Uuid('videoId') videoId: string,
    @Query('offset', ParseIntPipe) offset: number,
    @Req() req: Request,
  ): Promise<VideoProgress> {
    return this.videos.appendChunk(videoId, offset, req);
  }

  @Post('videos/:videoId/complete')
  @RequireSpacePermission(S.DOC_WRITE)
  @HttpCode(NO_CONTENT)
  async complete(@Uuid('videoId') videoId: string): Promise<void> {
    await this.videos.complete(videoId);
  }

  /** Oynatma: HTTP Range (ileri/geri sarma) desteklenir; içerik türü sabit, tarayıcı tahmin etmez. */
  @Get('videos/:videoId/stream')
  @RequireSpacePermission(S.DOC_VIEW)
  async stream(
    @Uuid('videoId') videoId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const source = await this.videos.source(videoId);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', source.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    const range = parseRange(req.headers.range, source.size);
    if (range === 'invalid') {
      res.status(416).setHeader('Content-Range', `bytes */${source.size}`).end();
      return;
    }
    const { start, end } = range ?? { start: 0, end: source.size - 1 };
    res.status(range ? 206 : 200);
    if (range) res.setHeader('Content-Range', `bytes ${start}-${end}/${source.size}`);
    res.setHeader('Content-Length', String(end - start + 1));
    const file = this.storage.openRange(source.key, start, end);
    file.on('error', () => res.destroy());
    res.on('close', () => file.destroy());
    file.pipe(res);
  }

  @Patch('videos/:videoId')
  @RequireSpacePermission(S.DOC_WRITE)
  @HttpCode(NO_CONTENT)
  async update(@Uuid('videoId') videoId: string, @Body() body: UpdateVideoDto): Promise<void> {
    await this.videos.update(videoId, body);
  }

  @Delete('videos/:videoId')
  @RequireSpacePermission(S.DOC_WRITE)
  @HttpCode(NO_CONTENT)
  async remove(@Uuid('videoId') videoId: string): Promise<void> {
    await this.videos.remove(videoId);
  }

  // ---------- Klasörler ----------

  @Post('spaces/:spaceId/video-folders')
  @RequireSpacePermission(S.DOC_WRITE)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  createFolder(@Uuid('spaceId') spaceId: string, @Body() body: CreateFolderDto): Promise<Created> {
    return this.videos.createFolder(spaceId, body);
  }

  @Patch('video-folders/:videoFolderId')
  @RequireSpacePermission(S.DOC_WRITE)
  @HttpCode(NO_CONTENT)
  async renameFolder(
    @Uuid('videoFolderId') folderId: string,
    @Body() body: UpdateFolderDto,
  ): Promise<void> {
    await this.videos.renameFolder(folderId, body);
  }

  @Delete('video-folders/:videoFolderId')
  @RequireSpacePermission(S.DOC_WRITE)
  @HttpCode(NO_CONTENT)
  async removeFolder(@Uuid('videoFolderId') folderId: string): Promise<void> {
    await this.videos.removeFolder(folderId);
  }
}

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
} from '@nestjs/common';
import {
  CreatedSchema,
  CreateDocRequestSchema,
  DocDetailSchema,
  DocsResponseSchema,
  DocVersionDetailSchema,
  DocVersionsResponseSchema,
  MoveDocRequestSchema,
  SPACE_PERMISSIONS as S,
  UpdateDocRequestSchema,
  UpdateDocResponseSchema,
  type Created,
  type DocDetail,
  type DocsResponse,
  type DocVersionDetail,
  type DocVersionsResponse,
  type UpdateDocResponse,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequireSpacePermission } from '../auth/decorators';
import { DocsService } from './docs.service';

class DocsDto extends createZodDto(DocsResponseSchema) {}
class DocDetailDto extends createZodDto(DocDetailSchema) {}
class CreateDocDto extends createZodDto(CreateDocRequestSchema) {}
class UpdateDocDto extends createZodDto(UpdateDocRequestSchema) {}
class UpdateDocResponseDto extends createZodDto(UpdateDocResponseSchema) {}
class MoveDocDto extends createZodDto(MoveDocRequestSchema) {}
class CreatedDto extends createZodDto(CreatedSchema) {}
class VersionsDto extends createZodDto(DocVersionsResponseSchema) {}
class VersionDetailDto extends createZodDto(DocVersionDetailSchema) {}

const Uuid = (name: string) => Param(name, ParseUUIDPipe);
const NO_CONTENT = HttpStatus.NO_CONTENT;

/** Doküman sayfaları (Faz 3.2, ADR-069). Okuma `doc.view`, yazma `doc.write`. */
@Controller('workspaces/:workspaceId')
export class DocsController {
  constructor(private readonly docs: DocsService) {}

  @Get('spaces/:spaceId/docs')
  @RequireSpacePermission(S.DOC_VIEW)
  @ZodResponse({ type: DocsDto })
  list(@Uuid('spaceId') spaceId: string): Promise<DocsResponse> {
    return this.docs.list(spaceId);
  }

  @Get('spaces/:spaceId/docs/trash')
  @RequireSpacePermission(S.DOC_VIEW)
  @ZodResponse({ type: DocsDto })
  trash(@Uuid('spaceId') spaceId: string): Promise<DocsResponse> {
    return this.docs.trash(spaceId);
  }

  @Post('spaces/:spaceId/docs')
  @RequireSpacePermission(S.DOC_WRITE)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  create(@Uuid('spaceId') spaceId: string, @Body() body: CreateDocDto): Promise<Created> {
    return this.docs.create(spaceId, body);
  }

  @Get('docs/:docId')
  @RequireSpacePermission(S.DOC_VIEW)
  @ZodResponse({ type: DocDetailDto })
  get(@Uuid('docId') docId: string): Promise<DocDetail> {
    return this.docs.get(docId);
  }

  @Patch('docs/:docId')
  @RequireSpacePermission(S.DOC_WRITE)
  @ZodResponse({ type: UpdateDocResponseDto })
  update(@Uuid('docId') docId: string, @Body() body: UpdateDocDto): Promise<UpdateDocResponse> {
    return this.docs.update(docId, body);
  }

  @Post('docs/:docId/move')
  @RequireSpacePermission(S.DOC_WRITE)
  @HttpCode(NO_CONTENT)
  move(@Uuid('docId') docId: string, @Body() body: MoveDocDto): Promise<void> {
    return this.docs.move(docId, body);
  }

  @Delete('docs/:docId')
  @RequireSpacePermission(S.DOC_WRITE)
  @HttpCode(NO_CONTENT)
  remove(@Uuid('docId') docId: string): Promise<void> {
    return this.docs.remove(docId);
  }

  @Post('docs/:docId/restore')
  @RequireSpacePermission(S.DOC_WRITE)
  @HttpCode(NO_CONTENT)
  restore(@Uuid('docId') docId: string): Promise<void> {
    return this.docs.restore(docId);
  }

  @Get('docs/:docId/versions')
  @RequireSpacePermission(S.DOC_VIEW)
  @ZodResponse({ type: VersionsDto })
  versions(@Uuid('docId') docId: string): Promise<DocVersionsResponse> {
    return this.docs.versions(docId);
  }

  @Get('docs/:docId/versions/:version')
  @RequireSpacePermission(S.DOC_VIEW)
  @ZodResponse({ type: VersionDetailDto })
  version(
    @Uuid('docId') docId: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<DocVersionDetail> {
    return this.docs.versionDetail(docId, version);
  }

  @Post('docs/:docId/versions/:version/restore')
  @RequireSpacePermission(S.DOC_WRITE)
  @ZodResponse({ type: UpdateDocResponseDto })
  restoreVersion(
    @Uuid('docId') docId: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<UpdateDocResponse> {
    return this.docs.restoreVersion(docId, version);
  }
}

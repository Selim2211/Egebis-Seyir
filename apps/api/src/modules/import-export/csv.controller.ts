import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ExportResponseSchema,
  ImportPreviewRequestSchema,
  ImportPreviewSchema,
  ImportRequestSchema,
  ImportResultSchema,
  SPACE_PERMISSIONS as S,
  type ExportResponse,
  type ImportPreview,
  type ImportResult,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequireSpacePermission } from '../auth/decorators';
import { CsvService } from './csv.service';

class ExportDto extends createZodDto(ExportResponseSchema) {}
class PreviewRequestDto extends createZodDto(ImportPreviewRequestSchema) {}
class PreviewDto extends createZodDto(ImportPreviewSchema) {}
class ImportRequestDto extends createZodDto(ImportRequestSchema) {}
class ImportResultDto extends createZodDto(ImportResultSchema) {}

const Uuid = (name: string) => Param(name, ParseUUIDPipe);

/** List öğelerini CSV'ye aktarma ve CSV'den içe alma (Faz 5.7, ADR-085). */
@Controller('workspaces/:workspaceId/lists/:listId')
export class CsvController {
  constructor(private readonly csv: CsvService) {}

  @Get('export')
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: ExportDto })
  export(@Uuid('listId') listId: string): Promise<ExportResponse> {
    return this.csv.export(listId);
  }

  @Post('import/preview')
  @HttpCode(HttpStatus.OK)
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: PreviewDto })
  preview(@Uuid('listId') listId: string, @Body() body: PreviewRequestDto): Promise<ImportPreview> {
    return this.csv.preview(listId, body.csv, body.mapping);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: ImportResultDto })
  import(@Uuid('listId') listId: string, @Body() body: ImportRequestDto): Promise<ImportResult> {
    return this.csv.import(listId, body);
  }
}

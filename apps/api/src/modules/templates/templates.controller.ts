import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApplyTemplateRequestSchema,
  CreatedSchema,
  CreateSpaceFromTemplateRequestSchema,
  CreateSpaceTemplateRequestSchema,
  CreateTemplateRequestSchema,
  SPACE_PERMISSIONS as S,
  TemplatesResponseSchema,
  WORKSPACE_PERMISSIONS as W,
  type Created,
  type TemplatesResponse,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequirePermission, RequireSpacePermission } from '../auth/decorators';
import { TemplatesService } from './templates.service';

class TemplatesDto extends createZodDto(TemplatesResponseSchema) {}
class CreateTemplateDto extends createZodDto(CreateTemplateRequestSchema) {}
class ApplyDto extends createZodDto(ApplyTemplateRequestSchema) {}
class CreateSpaceTemplateDto extends createZodDto(CreateSpaceTemplateRequestSchema) {}
class FromTemplateDto extends createZodDto(CreateSpaceFromTemplateRequestSchema) {}
class CreatedDto extends createZodDto(CreatedSchema) {}

const Uuid = (name: string) => Param(name, ParseUUIDPipe);

/** Space şablonları: ITEM, LIST, SPRINT, DOC (Faz 5.5, ADR-083). Tür bazlı yetki serviste. */
@Controller('workspaces/:workspaceId/spaces/:spaceId/templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: TemplatesDto })
  list(@Uuid('spaceId') spaceId: string): Promise<TemplatesResponse> {
    return this.templates.list(spaceId);
  }

  @Post()
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  create(@Uuid('spaceId') spaceId: string, @Body() body: CreateTemplateDto): Promise<Created> {
    return this.templates.create(spaceId, body);
  }

  @Post(':templateId/apply')
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  apply(
    @Uuid('spaceId') spaceId: string,
    @Uuid('templateId') templateId: string,
    @Body() body: ApplyDto,
  ): Promise<Created> {
    return this.templates.apply(spaceId, templateId, body);
  }

  @Delete(':templateId')
  @RequireSpacePermission(S.SPACE_VIEW)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Uuid('spaceId') spaceId: string, @Uuid('templateId') templateId: string): Promise<void> {
    return this.templates.remove(spaceId, templateId);
  }
}

/** Space şablonları (workspace geneli) ve şablondan Space oluşturma. */
@Controller('workspaces/:workspaceId')
export class WorkspaceTemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get('space-templates')
  @RequirePermission(W.SPACE_CREATE)
  @ZodResponse({ type: TemplatesDto })
  list(): Promise<TemplatesResponse> {
    return this.templates.listSpaceTemplates();
  }

  @Post('space-templates')
  @RequirePermission(W.SPACE_CREATE)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  create(@Body() body: CreateSpaceTemplateDto): Promise<Created> {
    return this.templates.createSpaceTemplate(body);
  }

  @Delete('space-templates/:templateId')
  @RequirePermission(W.SPACE_CREATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Uuid('templateId') templateId: string): Promise<void> {
    return this.templates.remove(null, templateId);
  }

  @Post('spaces/from-template')
  @RequirePermission(W.SPACE_CREATE)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  fromTemplate(@Body() body: FromTemplateDto): Promise<Created> {
    return this.templates.createSpaceFromTemplate(body);
  }
}

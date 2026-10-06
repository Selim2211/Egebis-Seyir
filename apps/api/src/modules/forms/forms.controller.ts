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
} from '@nestjs/common';
import {
  CreatedItemSchema,
  CreatedSchema,
  CreateFormRequestSchema,
  FormsResponseSchema,
  SPACE_PERMISSIONS as S,
  SubmitFormRequestSchema,
  UpdateFormRequestSchema,
  type Created,
  type CreatedItem,
  type FormsResponse,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequireSpacePermission } from '../auth/decorators';
import { FormsService } from './forms.service';

class FormsDto extends createZodDto(FormsResponseSchema) {}
class CreateFormDto extends createZodDto(CreateFormRequestSchema) {}
class UpdateFormDto extends createZodDto(UpdateFormRequestSchema) {}
class SubmitFormDto extends createZodDto(SubmitFormRequestSchema) {}
class CreatedDto extends createZodDto(CreatedSchema) {}
class CreatedItemDto extends createZodDto(CreatedItemSchema) {}

const Uuid = (name: string) => Param(name, ParseUUIDPipe);

/** Formlar (Faz 7.4, ADR-096): tanım `space.settings`, doldurma `space.view` yetkisiyle. */
@Controller('workspaces/:workspaceId/spaces/:spaceId/forms')
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  @Get()
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: FormsDto })
  list(@Uuid('spaceId') spaceId: string): Promise<FormsResponse> {
    return this.forms.list(spaceId);
  }

  @Post()
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  create(@Uuid('spaceId') spaceId: string, @Body() body: CreateFormDto): Promise<Created> {
    return this.forms.create(spaceId, body);
  }

  @Patch(':formId')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  update(
    @Uuid('spaceId') spaceId: string,
    @Uuid('formId') formId: string,
    @Body() body: UpdateFormDto,
  ): Promise<void> {
    return this.forms.update(spaceId, formId, body);
  }

  @Delete(':formId')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Uuid('spaceId') spaceId: string, @Uuid('formId') formId: string): Promise<void> {
    return this.forms.remove(spaceId, formId);
  }

  @Post(':formId/submissions')
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: CreatedItemDto, status: HttpStatus.CREATED })
  submit(
    @Uuid('spaceId') spaceId: string,
    @Uuid('formId') formId: string,
    @Body() body: SubmitFormDto,
  ): Promise<CreatedItem> {
    return this.forms.submit(spaceId, formId, body);
  }
}

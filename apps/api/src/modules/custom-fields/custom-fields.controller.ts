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
  CreateCustomFieldRequestSchema,
  CreatedSchema,
  CustomFieldsResponseSchema,
  MoveRequestSchema,
  SPACE_PERMISSIONS as S,
  UpdateCustomFieldRequestSchema,
  type Created,
  type CustomFieldsResponse,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequireSpacePermission } from '../auth/decorators';
import { CustomFieldsService } from './custom-fields.service';

class FieldsDto extends createZodDto(CustomFieldsResponseSchema) {}
class CreateFieldDto extends createZodDto(CreateCustomFieldRequestSchema) {}
class UpdateFieldDto extends createZodDto(UpdateCustomFieldRequestSchema) {}
class MoveDto extends createZodDto(MoveRequestSchema) {}
class CreatedDto extends createZodDto(CreatedSchema) {}

const Uuid = (name: string) => Param(name, ParseUUIDPipe);

/** Özel alan tanımları (Faz 5.4, ADR-082). Tanım yönetimi `space.settings`, okuma `space.view`. */
@Controller('workspaces/:workspaceId/spaces/:spaceId/custom-fields')
export class CustomFieldsController {
  constructor(private readonly fields: CustomFieldsService) {}

  @Get()
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: FieldsDto })
  list(@Uuid('spaceId') spaceId: string): Promise<CustomFieldsResponse> {
    return this.fields.list(spaceId);
  }

  @Post()
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  create(@Uuid('spaceId') spaceId: string, @Body() body: CreateFieldDto): Promise<Created> {
    return this.fields.create(spaceId, body);
  }

  @Patch(':fieldId')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  update(
    @Uuid('spaceId') spaceId: string,
    @Uuid('fieldId') fieldId: string,
    @Body() body: UpdateFieldDto,
  ): Promise<void> {
    return this.fields.update(spaceId, fieldId, body);
  }

  @Post(':fieldId/move')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  move(
    @Uuid('spaceId') spaceId: string,
    @Uuid('fieldId') fieldId: string,
    @Body() body: MoveDto,
  ): Promise<void> {
    return this.fields.move(spaceId, fieldId, body.afterId);
  }

  @Delete(':fieldId')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Uuid('spaceId') spaceId: string, @Uuid('fieldId') fieldId: string): Promise<void> {
    return this.fields.remove(spaceId, fieldId);
  }
}

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
  CreatedSchema,
  CreateSavedViewRequestSchema,
  SavedViewsResponseSchema,
  SPACE_PERMISSIONS as S,
  UpdateSavedViewRequestSchema,
  type Created,
  type SavedViewsResponse,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequireSpacePermission } from '../auth/decorators';
import { SavedViewsService } from './saved-views.service';

class ViewsDto extends createZodDto(SavedViewsResponseSchema) {}
class CreateViewDto extends createZodDto(CreateSavedViewRequestSchema) {}
class UpdateViewDto extends createZodDto(UpdateSavedViewRequestSchema) {}
class CreatedDto extends createZodDto(CreatedSchema) {}

const Uuid = (name: string) => Param(name, ParseUUIDPipe);

/** Kayıtlı görünümler (Faz 5.1, ADR-079). Kişisel görünüm için görme yetkisi yeter. */
@Controller('workspaces/:workspaceId/lists/:listId/views')
export class SavedViewsController {
  constructor(private readonly views: SavedViewsService) {}

  @Get()
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: ViewsDto })
  list(@Uuid('listId') listId: string): Promise<SavedViewsResponse> {
    return this.views.list(listId);
  }

  @Post()
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  create(@Uuid('listId') listId: string, @Body() body: CreateViewDto): Promise<Created> {
    return this.views.create(listId, body);
  }

  @Patch(':viewId')
  @RequireSpacePermission(S.SPACE_VIEW)
  @HttpCode(HttpStatus.NO_CONTENT)
  update(
    @Uuid('listId') listId: string,
    @Uuid('viewId') viewId: string,
    @Body() body: UpdateViewDto,
  ): Promise<void> {
    return this.views.update(listId, viewId, body);
  }

  @Delete(':viewId')
  @RequireSpacePermission(S.SPACE_VIEW)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Uuid('listId') listId: string, @Uuid('viewId') viewId: string): Promise<void> {
    return this.views.remove(listId, viewId);
  }
}

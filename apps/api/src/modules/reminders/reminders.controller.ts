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
  CreatedSchema,
  CreateReminderRequestSchema,
  RemindersResponseSchema,
  SPACE_PERMISSIONS as S,
  type Created,
  type RemindersResponse,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequireSpacePermission } from '../auth/decorators';
import { RemindersService } from './reminders.service';

class CreateReminderDto extends createZodDto(CreateReminderRequestSchema) {}
class RemindersDto extends createZodDto(RemindersResponseSchema) {}
class CreatedDto extends createZodDto(CreatedSchema) {}

/** Görev hatırlatıcıları: herkes yalnızca kendi hatırlatıcısını görür ve yönetir (Faz 7.3). */
@Controller('workspaces/:workspaceId/items/:itemId/reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get()
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: RemindersDto })
  async list(@Param('itemId', ParseUUIDPipe) itemId: string): Promise<RemindersResponse> {
    return { reminders: await this.reminders.list(itemId) };
  }

  @Post()
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  create(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: CreateReminderDto,
  ): Promise<Created> {
    return this.reminders.create(itemId, body);
  }

  @Delete(':reminderId')
  @RequireSpacePermission(S.SPACE_VIEW)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('reminderId', ParseUUIDPipe) reminderId: string,
  ): Promise<void> {
    await this.reminders.remove(itemId, reminderId);
  }
}

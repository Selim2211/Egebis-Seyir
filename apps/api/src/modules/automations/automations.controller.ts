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
  AutomationRunsResponseSchema,
  AutomationsResponseSchema,
  CreateAutomationRequestSchema,
  CreatedSchema,
  SPACE_PERMISSIONS as S,
  UpdateAutomationRequestSchema,
  type AutomationRunsResponse,
  type AutomationsResponse,
  type Created,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequireSpacePermission } from '../auth/decorators';
import { AutomationsService } from './automations.service';

class AutomationsDto extends createZodDto(AutomationsResponseSchema) {}
class RunsDto extends createZodDto(AutomationRunsResponseSchema) {}
class CreateAutomationDto extends createZodDto(CreateAutomationRequestSchema) {}
class UpdateAutomationDto extends createZodDto(UpdateAutomationRequestSchema) {}
class CreatedDto extends createZodDto(CreatedSchema) {}

const Uuid = (name: string) => Param(name, ParseUUIDPipe);

/** Otomasyonlar (Faz 5.6, ADR-084): tanım ve günlük `space.settings` yetkisiyle. */
@Controller('workspaces/:workspaceId/spaces/:spaceId/automations')
export class AutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  @Get()
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @ZodResponse({ type: AutomationsDto })
  list(@Uuid('spaceId') spaceId: string): Promise<AutomationsResponse> {
    return this.automations.list(spaceId);
  }

  @Post()
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  create(@Uuid('spaceId') spaceId: string, @Body() body: CreateAutomationDto): Promise<Created> {
    return this.automations.create(spaceId, body);
  }

  @Patch(':automationId')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  update(
    @Uuid('spaceId') spaceId: string,
    @Uuid('automationId') automationId: string,
    @Body() body: UpdateAutomationDto,
  ): Promise<void> {
    return this.automations.update(spaceId, automationId, body);
  }

  @Delete(':automationId')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Uuid('spaceId') spaceId: string,
    @Uuid('automationId') automationId: string,
  ): Promise<void> {
    return this.automations.remove(spaceId, automationId);
  }

  @Get(':automationId/runs')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @ZodResponse({ type: RunsDto })
  runs(
    @Uuid('spaceId') spaceId: string,
    @Uuid('automationId') automationId: string,
  ): Promise<AutomationRunsResponse> {
    return this.automations.runs(spaceId, automationId);
  }
}

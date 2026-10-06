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
  CreateTeamRequestSchema,
  TeamsResponseSchema,
  UpdateTeamRequestSchema,
  type Created,
  type TeamsResponse,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { TeamsService } from './teams.service';

class TeamsDto extends createZodDto(TeamsResponseSchema) {}
class CreateTeamDto extends createZodDto(CreateTeamRequestSchema) {}
class UpdateTeamDto extends createZodDto(UpdateTeamRequestSchema) {}
class CreatedDto extends createZodDto(CreatedSchema) {}

/** Ekipler (Faz 7.7, ADR-101): Guest dışındaki workspace üyeleri. */
@Controller('workspaces/:workspaceId/teams')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  @ZodResponse({ type: TeamsDto })
  list(): Promise<TeamsResponse> {
    return this.teams.list();
  }

  @Post()
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  create(@Body() body: CreateTeamDto): Promise<Created> {
    return this.teams.create(body);
  }

  @Patch(':teamId')
  @HttpCode(HttpStatus.NO_CONTENT)
  update(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() body: UpdateTeamDto,
  ): Promise<void> {
    return this.teams.update(teamId, body);
  }

  @Delete(':teamId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('teamId', ParseUUIDPipe) teamId: string): Promise<void> {
    return this.teams.remove(teamId);
  }
}

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
  Put,
} from '@nestjs/common';
import {
  CreatedSchema,
  CreateGoalRequestSchema,
  GoalsResponseSchema,
  UpdateGoalRequestSchema,
  type Created,
  type GoalsResponse,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { GoalsService } from './goals.service';

class GoalsDto extends createZodDto(GoalsResponseSchema) {}
class CreateGoalDto extends createZodDto(CreateGoalRequestSchema) {}
class UpdateGoalDto extends createZodDto(UpdateGoalRequestSchema) {}
class CreatedDto extends createZodDto(CreatedSchema) {}

const Uuid = (name: string) => Param(name, ParseUUIDPipe);

/** Hedefler (Faz 7.9, ADR-097): Guest dışındaki workspace üyeleri. */
@Controller('workspaces/:workspaceId/goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  @ZodResponse({ type: GoalsDto })
  list(): Promise<GoalsResponse> {
    return this.goals.list();
  }

  @Post()
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  create(@Body() body: CreateGoalDto): Promise<Created> {
    return this.goals.create(body);
  }

  @Patch(':goalId')
  @HttpCode(HttpStatus.NO_CONTENT)
  update(@Uuid('goalId') goalId: string, @Body() body: UpdateGoalDto): Promise<void> {
    return this.goals.update(goalId, body);
  }

  @Delete(':goalId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Uuid('goalId') goalId: string): Promise<void> {
    return this.goals.remove(goalId);
  }

  @Put(':goalId/items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  link(@Uuid('goalId') goalId: string, @Uuid('itemId') itemId: string): Promise<void> {
    return this.goals.link(goalId, itemId);
  }

  @Delete(':goalId/items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  unlink(@Uuid('goalId') goalId: string, @Uuid('itemId') itemId: string): Promise<void> {
    return this.goals.unlink(goalId, itemId);
  }
}

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
  Query,
} from '@nestjs/common';
import {
  BacklogResponseSchema,
  CompleteSprintRequestSchema,
  CreatedSchema,
  CreateRetroItemRequestSchema,
  RetroResponseSchema,
  RetroTaskCreatedSchema,
  CreateSprintRequestSchema,
  MoveBacklogItemsRequestSchema,
  NestItemRequestSchema,
  SPACE_PERMISSIONS as S,
  SetReviewNotesRequestSchema,
  SprintBurndownSchema,
  SprintDetailSchema,
  SprintReviewSchema,
  SprintsResponseSchema,
  VelocityResponseSchema,
  UpdateSprintRequestSchema,
  type BacklogResponse,
  type Created,
  type RetroResponse,
  type RetroTaskCreated,
  type SprintBurndown,
  type SprintDetail,
  type SprintReview,
  type SprintsResponse,
  type VelocityResponse,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequireSpacePermission } from '../auth/decorators';
import { BacklogService } from './backlog.service';
import { RetroService } from './retro.service';
import { SprintLifecycleService } from './sprint-lifecycle.service';
import { SprintReportsService } from './sprint-reports.service';
import { SprintsService } from './sprints.service';

class RetroDto extends createZodDto(RetroResponseSchema) {}
class CreateRetroItemDto extends createZodDto(CreateRetroItemRequestSchema) {}
class RetroTaskDto extends createZodDto(RetroTaskCreatedSchema) {}
class BurndownDto extends createZodDto(SprintBurndownSchema) {}
class VelocityDto extends createZodDto(VelocityResponseSchema) {}
class SprintsDto extends createZodDto(SprintsResponseSchema) {}
class SprintDetailDto extends createZodDto(SprintDetailSchema) {}
class CreateSprintDto extends createZodDto(CreateSprintRequestSchema) {}
class UpdateSprintDto extends createZodDto(UpdateSprintRequestSchema) {}
class CreatedDto extends createZodDto(CreatedSchema) {}
class BacklogDto extends createZodDto(BacklogResponseSchema) {}
class CompleteSprintDto extends createZodDto(CompleteSprintRequestSchema) {}
class SprintReviewDto extends createZodDto(SprintReviewSchema) {}
class ReviewNotesDto extends createZodDto(SetReviewNotesRequestSchema) {}
class MoveBacklogDto extends createZodDto(MoveBacklogItemsRequestSchema) {}
class NestItemDto extends createZodDto(NestItemRequestSchema) {}

const Uuid = (name: string) => Param(name, ParseUUIDPipe);
const NO_CONTENT = HttpStatus.NO_CONTENT;

/** Sprint'ler ve Product Backlog. Space izni guard'da çözülür (ADR-039). */
@Controller('workspaces/:workspaceId')
export class SprintsController {
  constructor(
    private readonly sprints: SprintsService,
    private readonly backlog: BacklogService,
    private readonly lifecycle: SprintLifecycleService,
    private readonly reports: SprintReportsService,
    private readonly retro: RetroService,
  ) {}

  @Get('spaces/:spaceId/sprints')
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: SprintsDto })
  list(@Uuid('spaceId') spaceId: string): Promise<SprintsResponse> {
    return this.sprints.list(spaceId);
  }

  @Post('spaces/:spaceId/sprints')
  @RequireSpacePermission(S.SPRINT_PLAN)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  create(@Uuid('spaceId') spaceId: string, @Body() body: CreateSprintDto): Promise<Created> {
    return this.sprints.create(spaceId, body);
  }

  @Get('sprints/:sprintId')
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: SprintDetailDto })
  detail(@Uuid('sprintId') sprintId: string, @Query('tree') tree?: string): Promise<SprintDetail> {
    return this.sprints.detail(sprintId, tree === 'true');
  }

  @Get('sprints/:sprintId/review')
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: SprintReviewDto })
  review(@Uuid('sprintId') sprintId: string): Promise<SprintReview> {
    return this.sprints.review(sprintId);
  }

  @Put('sprints/:sprintId/review-notes')
  @RequireSpacePermission(S.SPRINT_COMPLETE)
  @HttpCode(NO_CONTENT)
  reviewNotes(@Uuid('sprintId') sprintId: string, @Body() body: ReviewNotesDto): Promise<void> {
    return this.sprints.setReviewNotes(sprintId, body);
  }

  @Patch('sprints/:sprintId')
  @RequireSpacePermission(S.SPRINT_PLAN)
  @HttpCode(NO_CONTENT)
  update(@Uuid('sprintId') sprintId: string, @Body() body: UpdateSprintDto): Promise<void> {
    return this.sprints.update(sprintId, body);
  }

  @Delete('sprints/:sprintId')
  @RequireSpacePermission(S.SPRINT_PLAN)
  @HttpCode(NO_CONTENT)
  remove(@Uuid('sprintId') sprintId: string): Promise<void> {
    return this.sprints.remove(sprintId);
  }

  @Post('sprints/:sprintId/start')
  @RequireSpacePermission(S.SPRINT_START)
  @HttpCode(NO_CONTENT)
  start(@Uuid('sprintId') sprintId: string): Promise<void> {
    return this.lifecycle.start(sprintId);
  }

  @Post('sprints/:sprintId/complete')
  @RequireSpacePermission(S.SPRINT_COMPLETE)
  @HttpCode(NO_CONTENT)
  complete(@Uuid('sprintId') sprintId: string, @Body() body: CompleteSprintDto): Promise<void> {
    return this.lifecycle.complete(sprintId, body);
  }

  /** Yalnızca Product Owner ve yöneticiler (brief §6.1.6). */
  @Post('sprints/:sprintId/cancel')
  @RequireSpacePermission(S.SPRINT_CANCEL)
  @HttpCode(NO_CONTENT)
  cancel(@Uuid('sprintId') sprintId: string): Promise<void> {
    return this.lifecycle.cancel(sprintId);
  }

  @Get('spaces/:spaceId/backlog')
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: BacklogDto })
  getBacklog(@Uuid('spaceId') spaceId: string): Promise<BacklogResponse> {
    return this.backlog.backlog(spaceId);
  }

  /** Sprint'e taşı / Backlog'a geri al / yeniden sırala. İzin serviste kapsayıcıya göre denetlenir. */
  @Post('spaces/:spaceId/backlog/move')
  @RequireSpacePermission(S.SPACE_VIEW)
  @HttpCode(NO_CONTENT)
  move(@Uuid('spaceId') spaceId: string, @Body() body: MoveBacklogDto): Promise<void> {
    return this.backlog.move(spaceId, body);
  }

  /** Öğeyi başka öğenin alt öğesi yap (sürükle-bırak, ADR-102). */
  @Post('items/:itemId/nest')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @HttpCode(NO_CONTENT)
  nest(@Uuid('itemId') itemId: string, @Body() body: NestItemDto): Promise<void> {
    return this.backlog.nest(itemId, body);
  }

  @Get('sprints/:sprintId/burndown')
  @RequireSpacePermission(S.REPORT_VIEW)
  @ZodResponse({ type: BurndownDto })
  burndown(@Uuid('sprintId') sprintId: string): Promise<SprintBurndown> {
    return this.reports.burndown(sprintId);
  }

  @Get('spaces/:spaceId/velocity')
  @RequireSpacePermission(S.REPORT_VIEW)
  @ZodResponse({ type: VelocityDto })
  velocity(@Uuid('spaceId') spaceId: string): Promise<VelocityResponse> {
    return this.reports.velocity(spaceId);
  }

  // ---------- Retrospektif (ADR-071) ----------

  @Get('sprints/:sprintId/retro')
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: RetroDto })
  getRetro(@Uuid('sprintId') sprintId: string): Promise<RetroResponse> {
    return this.retro.get(sprintId);
  }

  @Post('sprints/:sprintId/retro/items')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  addRetroItem(
    @Uuid('sprintId') sprintId: string,
    @Body() body: CreateRetroItemDto,
  ): Promise<Created> {
    return this.retro.add(sprintId, body);
  }

  @Delete('sprints/:sprintId/retro/items/:retroItemId')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @HttpCode(NO_CONTENT)
  removeRetroItem(
    @Uuid('sprintId') sprintId: string,
    @Uuid('retroItemId') retroItemId: string,
  ): Promise<void> {
    return this.retro.remove(sprintId, retroItemId);
  }

  @Put('sprints/:sprintId/retro/items/:retroItemId/vote')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @HttpCode(NO_CONTENT)
  voteRetroItem(
    @Uuid('sprintId') sprintId: string,
    @Uuid('retroItemId') retroItemId: string,
  ): Promise<void> {
    return this.retro.toggleVote(sprintId, retroItemId);
  }

  @Post('sprints/:sprintId/retro/items/:retroItemId/task')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @ZodResponse({ type: RetroTaskDto, status: HttpStatus.CREATED })
  retroItemToTask(
    @Uuid('sprintId') sprintId: string,
    @Uuid('retroItemId') retroItemId: string,
  ): Promise<RetroTaskCreated> {
    return this.retro.toTask(sprintId, retroItemId);
  }
}

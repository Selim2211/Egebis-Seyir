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
  AiEstimateSchema,
  AiSplitSuggestionSchema,
  AiSprintGoalRequestSchema,
  AiSprintGoalSchema,
  AiStatusSchema,
  AiStorySuggestionSchema,
  AiSummarySchema,
  SPACE_PERMISSIONS as S,
  type AiEstimate,
  type AiSplitSuggestion,
  type AiSprintGoal,
  type AiStatus,
  type AiStorySuggestion,
  type AiSummary,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequireSpacePermission } from '../auth/decorators';
import { AiService } from './ai.service';

class StatusDto extends createZodDto(AiStatusSchema) {}
class SummaryDto extends createZodDto(AiSummarySchema) {}
class StoryDto extends createZodDto(AiStorySuggestionSchema) {}
class SplitDto extends createZodDto(AiSplitSuggestionSchema) {}
class EstimateDto extends createZodDto(AiEstimateSchema) {}
class SprintGoalRequestDto extends createZodDto(AiSprintGoalRequestSchema) {}
class SprintGoalDto extends createZodDto(AiSprintGoalSchema) {}

const Uuid = (name: string) => Param(name, ParseUUIDPipe);

/** Yapay zekâ destekli öneriler (Faz 6.5, ADR-090). Öneriler okunur; uygulamak mevcut yazma uçlarıyla yapılır. */
@Controller('workspaces/:workspaceId')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('ai/status')
  @ZodResponse({ type: StatusDto })
  status(): Promise<AiStatus> {
    return this.ai.status();
  }

  @Post('items/:itemId/ai/summarize')
  @HttpCode(HttpStatus.OK)
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: SummaryDto })
  summarize(@Uuid('itemId') itemId: string): Promise<AiSummary> {
    return this.ai.summarize(itemId);
  }

  @Post('items/:itemId/ai/suggest-story')
  @HttpCode(HttpStatus.OK)
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @ZodResponse({ type: StoryDto })
  suggestStory(@Uuid('itemId') itemId: string): Promise<AiStorySuggestion> {
    return this.ai.suggestStory(itemId);
  }

  @Post('items/:itemId/ai/estimate')
  @HttpCode(HttpStatus.OK)
  @RequireSpacePermission(S.ESTIMATE_WRITE)
  @ZodResponse({ type: EstimateDto })
  estimate(@Uuid('itemId') itemId: string): Promise<AiEstimate> {
    return this.ai.estimate(itemId);
  }

  /** Sprint hedefi öner / kontrol et (ADR-175): sprint planlayabilen herkes (Scrum Master dahil). */
  @Post('spaces/:spaceId/ai/sprint-goal')
  @HttpCode(HttpStatus.OK)
  @RequireSpacePermission(S.SPRINT_PLAN)
  @ZodResponse({ type: SprintGoalDto })
  sprintGoal(
    @Uuid('spaceId') spaceId: string,
    @Body() body: SprintGoalRequestDto,
  ): Promise<AiSprintGoal> {
    return this.ai.sprintGoal(spaceId, body);
  }

  @Post('items/:itemId/ai/split-epic')
  @HttpCode(HttpStatus.OK)
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @ZodResponse({ type: SplitDto })
  splitEpic(@Uuid('itemId') itemId: string): Promise<AiSplitSuggestion> {
    return this.ai.splitEpic(itemId);
  }
}

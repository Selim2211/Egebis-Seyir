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
  BulkUpdateRequestSchema,
  CreateChecklistEntryRequestSchema,
  CreateChecklistRequestSchema,
  CreateLinkRequestSchema,
  ItemSearchResponseSchema,
  MY_WORK_SCOPES,
  MyWorkResponseSchema,
  SearchResponseSchema,
  RenameChecklistRequestSchema,
  SplitItemRequestSchema,
  SplitItemResponseSchema,
  UpdateChecklistEntryRequestSchema,
  CopyItemRequestSchema,
  CreatedItemSchema,
  CreatedSchema,
  EpicsResponseSchema,
  CreateLabelRequestSchema,
  CreateWorkItemRequestSchema,
  LabelsResponseSchema,
  MoveItemRequestSchema,
  SetReadinessRequestSchema,
  SPACE_PERMISSIONS as S,
  UpdateLabelRequestSchema,
  UpdateWorkItemRequestSchema,
  WorkItemDetailSchema,
  WorkItemsResponseSchema,
  type Created,
  type CreatedItem,
  type EpicsResponse,
  type ItemSearchResponse,
  type MyWorkResponse,
  type MyWorkScope,
  type SearchResponse,
  type LabelsResponse,
  type SplitItemResponse,
  type WorkItemDetail,
  type WorkItemsResponse,
} from '@scrum/shared';
import { createZodDto, ZodResponse, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { RequireSpacePermission } from '../auth/decorators';
import { EpicsService } from './epics.service';
import { ItemDetailsService } from './item-details.service';
import { ItemQueriesService } from './item-queries.service';
import { ItemTreeService } from './item-tree.service';
import { LabelsService } from './labels.service';
import { WorkItemsService } from './work-items.service';

class EpicsDto extends createZodDto(EpicsResponseSchema) {}
class WorkItemsDto extends createZodDto(WorkItemsResponseSchema) {}
class WorkItemDetailDto extends createZodDto(WorkItemDetailSchema) {}
class CreateWorkItemDto extends createZodDto(CreateWorkItemRequestSchema) {}
class UpdateWorkItemDto extends createZodDto(UpdateWorkItemRequestSchema) {}
class CreatedItemDto extends createZodDto(CreatedItemSchema) {}
class MoveItemDto extends createZodDto(MoveItemRequestSchema) {}
class CopyItemDto extends createZodDto(CopyItemRequestSchema) {}
class BulkUpdateDto extends createZodDto(BulkUpdateRequestSchema) {}
class SetReadinessDto extends createZodDto(SetReadinessRequestSchema) {}
class LabelsDto extends createZodDto(LabelsResponseSchema) {}
class CreateLabelDto extends createZodDto(CreateLabelRequestSchema) {}
class UpdateLabelDto extends createZodDto(UpdateLabelRequestSchema) {}
class CreatedDto extends createZodDto(CreatedSchema) {}
class CreateChecklistDto extends createZodDto(CreateChecklistRequestSchema) {}
class RenameChecklistDto extends createZodDto(RenameChecklistRequestSchema) {}
class CreateEntryDto extends createZodDto(CreateChecklistEntryRequestSchema) {}
class UpdateEntryDto extends createZodDto(UpdateChecklistEntryRequestSchema) {}
class CreateLinkDto extends createZodDto(CreateLinkRequestSchema) {}
class SplitItemDto extends createZodDto(SplitItemRequestSchema) {}
class SplitItemResponseDto extends createZodDto(SplitItemResponseSchema) {}
class ItemSearchDto extends createZodDto(ItemSearchResponseSchema) {}
class MyWorkDto extends createZodDto(MyWorkResponseSchema) {}
class SearchDto extends createZodDto(SearchResponseSchema) {}

const ScopePipe = new ZodValidationPipe(z.enum(MY_WORK_SCOPES).default('assigned'));

const Uuid = (name: string) => Param(name, ParseUUIDPipe);
const NO_CONTENT = HttpStatus.NO_CONTENT;

/** Liste içi iş öğeleri ve Space etiketleri. Space izni guard'da çözülür (ADR-039). */
@Controller('workspaces/:workspaceId')
export class WorkItemsController {
  constructor(
    private readonly items: WorkItemsService,
    private readonly tree: ItemTreeService,
    private readonly labels: LabelsService,
    private readonly details: ItemDetailsService,
    private readonly queries: ItemQueriesService,
    private readonly epics: EpicsService,
  ) {}

  /** Görülebilen Space'lerde başlık, açıklama ve kimlik araması (ADR-053). */
  @Get('search')
  @ZodResponse({ type: SearchDto })
  globalSearch(@Query('q') q = ''): Promise<SearchResponse> {
    return this.queries.search(q);
  }

  /** Bana atananlar / oluşturduklarım / izlediklerim (ADR-054). */
  @Get('my-work')
  @ZodResponse({ type: MyWorkDto })
  myWork(
    @Query('scope', ScopePipe) scope: MyWorkScope,
    @Query('includeDone') includeDone?: string,
  ): Promise<MyWorkResponse> {
    return this.queries.myWork(scope, includeDone === 'true');
  }

  /** Space'in Epic'leri: ilerleme ve puan özeti (brief §5.7). */
  @Get('spaces/:spaceId/epics')
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: EpicsDto })
  epicList(@Uuid('spaceId') spaceId: string): Promise<EpicsResponse> {
    return this.epics.list(spaceId);
  }

  @Get('lists/:listId/items')
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: WorkItemsDto })
  list(@Uuid('listId') listId: string): Promise<WorkItemsResponse> {
    return this.items.list(listId);
  }

  @Post('lists/:listId/items')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @ZodResponse({ type: CreatedItemDto, status: HttpStatus.CREATED })
  create(@Uuid('listId') listId: string, @Body() body: CreateWorkItemDto): Promise<CreatedItem> {
    return this.items.create(listId, body);
  }

  /** DoR işaretleri (Story/Bug). */
  @Put('items/:itemId/dor')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @HttpCode(NO_CONTENT)
  setDor(@Uuid('itemId') itemId: string, @Body() body: SetReadinessDto): Promise<void> {
    return this.items.setReadiness(itemId, 'dor', body.checked);
  }

  /** DoD işaretleri (Story/Bug). */
  @Put('items/:itemId/dod')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @HttpCode(NO_CONTENT)
  setDod(@Uuid('itemId') itemId: string, @Body() body: SetReadinessDto): Promise<void> {
    return this.items.setReadiness(itemId, 'dod', body.checked);
  }

  /** Bağlantı eklerken öğe arama; `items/:itemId`'den önce tanımlanmalı. */
  @Get('items/search')
  @ZodResponse({ type: ItemSearchDto })
  search(@Query('q') q = '', @Query('exclude') exclude?: string): Promise<ItemSearchResponse> {
    return this.details.search(q, exclude);
  }

  /** `MOB-142` → öğe. Space görünürlüğü serviste denetlenir. */
  @Get('items/key/:key')
  @ZodResponse({ type: WorkItemDetailDto })
  byKey(@Param('key') key: string): Promise<WorkItemDetail> {
    return this.items.detailByKey(key);
  }

  @Get('items/:itemId')
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: WorkItemDetailDto })
  detail(@Uuid('itemId') itemId: string): Promise<WorkItemDetail> {
    return this.items.detail(itemId);
  }

  /** Alan bazlı yetki serviste (yapı, tahmin, kendi durumu). */
  @Patch('items/:itemId')
  @RequireSpacePermission(S.SPACE_VIEW)
  @HttpCode(NO_CONTENT)
  async update(@Uuid('itemId') itemId: string, @Body() body: UpdateWorkItemDto): Promise<void> {
    await this.items.update(itemId, body);
  }

  @Post('items/:itemId/move')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @HttpCode(NO_CONTENT)
  async move(@Uuid('itemId') itemId: string, @Body() body: MoveItemDto): Promise<void> {
    await this.tree.move(itemId, body);
  }

  @Post('items/:itemId/copy')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @ZodResponse({ type: CreatedItemDto, status: HttpStatus.CREATED })
  copy(@Uuid('itemId') itemId: string, @Body() body: CopyItemDto): Promise<CreatedItem> {
    return this.tree.copy(itemId, body);
  }

  @Post('items/:itemId/archive')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @HttpCode(NO_CONTENT)
  async archive(@Uuid('itemId') itemId: string): Promise<void> {
    await this.tree.change(itemId, 'archive');
  }

  @Post('items/:itemId/unarchive')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @HttpCode(NO_CONTENT)
  async unarchive(@Uuid('itemId') itemId: string): Promise<void> {
    await this.tree.change(itemId, 'unarchive');
  }

  @Delete('items/:itemId')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @HttpCode(NO_CONTENT)
  async trash(@Uuid('itemId') itemId: string): Promise<void> {
    await this.tree.change(itemId, 'delete');
  }

  @Post('items/:itemId/restore')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @HttpCode(NO_CONTENT)
  async restore(@Uuid('itemId') itemId: string): Promise<void> {
    await this.tree.change(itemId, 'restore');
  }

  @Post('spaces/:spaceId/items/bulk')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @HttpCode(NO_CONTENT)
  async bulk(@Uuid('spaceId') spaceId: string, @Body() body: BulkUpdateDto): Promise<void> {
    await this.tree.bulk(spaceId, body);
  }

  // ---------- Etiketler ----------

  @Get('spaces/:spaceId/labels')
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: LabelsDto })
  async listLabels(@Uuid('spaceId') spaceId: string): Promise<LabelsResponse> {
    return { labels: await this.labels.list(spaceId) };
  }

  @Post('spaces/:spaceId/labels')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  createLabel(@Uuid('spaceId') spaceId: string, @Body() body: CreateLabelDto): Promise<Created> {
    return this.labels.create(spaceId, body);
  }

  @Patch('labels/:labelId')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(NO_CONTENT)
  async updateLabel(@Uuid('labelId') labelId: string, @Body() body: UpdateLabelDto): Promise<void> {
    await this.labels.update(labelId, body);
  }

  @Delete('labels/:labelId')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(NO_CONTENT)
  async removeLabel(@Uuid('labelId') labelId: string): Promise<void> {
    await this.labels.remove(labelId);
  }

  // ---------- Görev detayı: checklist, bağlantı, izleyici, bölme (Faz 1.4) ----------

  @Post('items/:itemId/checklists')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  createChecklist(
    @Uuid('itemId') itemId: string,
    @Body() body: CreateChecklistDto,
  ): Promise<Created> {
    return this.details.createChecklist(itemId, body.title);
  }

  @Patch('items/:itemId/checklists/:checklistId')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @HttpCode(NO_CONTENT)
  async renameChecklist(
    @Uuid('itemId') itemId: string,
    @Uuid('checklistId') checklistId: string,
    @Body() body: RenameChecklistDto,
  ): Promise<void> {
    await this.details.renameChecklist(itemId, checklistId, body.title);
  }

  @Delete('items/:itemId/checklists/:checklistId')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @HttpCode(NO_CONTENT)
  async deleteChecklist(
    @Uuid('itemId') itemId: string,
    @Uuid('checklistId') checklistId: string,
  ): Promise<void> {
    await this.details.deleteChecklist(itemId, checklistId);
  }

  /** `checklistId` yerine `acceptance` yazılırsa kabul kriterleri listesine eklenir. */
  @Post('items/:itemId/checklists/:checklistId/entries')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  addEntry(
    @Uuid('itemId') itemId: string,
    @Param('checklistId') checklistId: string,
    @Body() body: CreateEntryDto,
  ): Promise<Created> {
    return this.details.addEntry(itemId, checklistId, body);
  }

  @Patch('items/:itemId/checklists/:checklistId/entries/:entryId')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @HttpCode(NO_CONTENT)
  async updateEntry(
    @Uuid('itemId') itemId: string,
    @Uuid('checklistId') checklistId: string,
    @Uuid('entryId') entryId: string,
    @Body() body: UpdateEntryDto,
  ): Promise<void> {
    await this.details.updateEntry(itemId, checklistId, entryId, body);
  }

  @Delete('items/:itemId/checklists/:checklistId/entries/:entryId')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @HttpCode(NO_CONTENT)
  async deleteEntry(
    @Uuid('itemId') itemId: string,
    @Uuid('checklistId') checklistId: string,
    @Uuid('entryId') entryId: string,
  ): Promise<void> {
    await this.details.deleteEntry(itemId, checklistId, entryId);
  }

  @Post('items/:itemId/links')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  addLink(@Uuid('itemId') itemId: string, @Body() body: CreateLinkDto): Promise<Created> {
    return this.details.addLink(itemId, body);
  }

  @Delete('items/:itemId/links/:linkId')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @HttpCode(NO_CONTENT)
  async removeLink(@Uuid('itemId') itemId: string, @Uuid('linkId') linkId: string): Promise<void> {
    await this.details.removeLink(itemId, linkId);
  }

  /** Görüntüleme izni olan herkes kendini izleyici yapabilir. */
  @Put('items/:itemId/watch')
  @RequireSpacePermission(S.SPACE_VIEW)
  @HttpCode(NO_CONTENT)
  async watch(@Uuid('itemId') itemId: string): Promise<void> {
    await this.details.setWatching(itemId, true);
  }

  @Delete('items/:itemId/watch')
  @RequireSpacePermission(S.SPACE_VIEW)
  @HttpCode(NO_CONTENT)
  async unwatch(@Uuid('itemId') itemId: string): Promise<void> {
    await this.details.setWatching(itemId, false);
  }

  @Post('items/:itemId/split')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @ZodResponse({ type: SplitItemResponseDto, status: HttpStatus.CREATED })
  split(@Uuid('itemId') itemId: string, @Body() body: SplitItemDto): Promise<SplitItemResponse> {
    return this.details.split(itemId, body.titles);
  }
}

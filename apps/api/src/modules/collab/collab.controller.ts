import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ActivityResponseSchema,
  AuditQuerySchema,
  AuditResponseSchema,
  CommentRequestSchema,
  CommentsResponseSchema,
  CreatedSchema,
  MentionCandidatesSchema,
  SPACE_PERMISSIONS as S,
  WORKSPACE_PERMISSIONS as W,
  ToggleReactionRequestSchema,
  type ActivityResponse,
  type AuditResponse,
  type CommentsResponse,
  type Created,
  type MentionCandidates,
} from '@scrum/shared';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequirePermission, RequireSpacePermission } from '../auth/decorators';
import { ActivityFeedService } from './activity-feed.service';
import { AttachmentsService } from './attachments.service';
import { CommentsService } from './comments.service';

class CommentsDto extends createZodDto(CommentsResponseSchema) {}
class CommentRequestDto extends createZodDto(CommentRequestSchema) {}
class ReactionDto extends createZodDto(ToggleReactionRequestSchema) {}
class CandidatesDto extends createZodDto(MentionCandidatesSchema) {}
class ActivityDto extends createZodDto(ActivityResponseSchema) {}
class AuditQueryDto extends createZodDto(AuditQuerySchema) {}
class AuditDto extends createZodDto(AuditResponseSchema) {}
class CreatedDto extends createZodDto(CreatedSchema) {}

const Uuid = (name: string) => Param(name, ParseUUIDPipe);
const NO_CONTENT = HttpStatus.NO_CONTENT;

/** Yorumlar, ekler ve aktivite akışları (Faz 1.6). Space izni guard'da çözülür (ADR-039). */
@Controller('workspaces/:workspaceId')
export class CollabController {
  constructor(
    private readonly comments: CommentsService,
    private readonly attachments: AttachmentsService,
    private readonly feed: ActivityFeedService,
  ) {}

  // ---------- Yorumlar ----------

  @Get('items/:itemId/comments')
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: CommentsDto })
  async listComments(@Uuid('itemId') itemId: string): Promise<CommentsResponse> {
    return { comments: await this.comments.list(itemId) };
  }

  @Get('items/:itemId/mention-candidates')
  @RequireSpacePermission(S.COMMENT_WRITE)
  @ZodResponse({ type: CandidatesDto })
  mentionCandidates(
    @Uuid('itemId') itemId: string,
    @Query('q') q = '',
  ): Promise<MentionCandidates> {
    return this.comments.candidates(itemId, q);
  }

  @Post('items/:itemId/comments')
  @RequireSpacePermission(S.COMMENT_WRITE)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  createComment(@Uuid('itemId') itemId: string, @Body() body: CommentRequestDto): Promise<Created> {
    return this.comments.create(itemId, body);
  }

  /** Düzenleme yalnızca yazara aittir (serviste). */
  @Patch('items/:itemId/comments/:commentId')
  @RequireSpacePermission(S.COMMENT_WRITE)
  @HttpCode(NO_CONTENT)
  async editComment(
    @Uuid('itemId') itemId: string,
    @Uuid('commentId') commentId: string,
    @Body() body: CommentRequestDto,
  ): Promise<void> {
    await this.comments.update(itemId, commentId, body);
  }

  /** Yazar veya `space.settings` sahibi siler (serviste). */
  @Delete('items/:itemId/comments/:commentId')
  @RequireSpacePermission(S.COMMENT_WRITE)
  @HttpCode(NO_CONTENT)
  async deleteComment(
    @Uuid('itemId') itemId: string,
    @Uuid('commentId') commentId: string,
  ): Promise<void> {
    await this.comments.remove(itemId, commentId);
  }

  @Put('items/:itemId/comments/:commentId/reactions')
  @RequireSpacePermission(S.COMMENT_WRITE)
  @HttpCode(NO_CONTENT)
  async toggleReaction(
    @Uuid('itemId') itemId: string,
    @Uuid('commentId') commentId: string,
    @Body() body: ReactionDto,
  ): Promise<void> {
    await this.comments.toggleReaction(itemId, commentId, body.emoji);
  }

  // ---------- Ekler ----------

  @Post('items/:itemId/attachments')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @UseInterceptors(FileInterceptor('file'))
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  uploadAttachment(
    @Uuid('itemId') itemId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<Created> {
    return this.attachments.upload(itemId, file);
  }

  /** Güvenli sunum: `?preview=1` yalnızca resim/PDF'te satır içi, diğerleri indirilir (ADR-056). */
  @Get('items/:itemId/attachments/:attachmentId')
  @RequireSpacePermission(S.SPACE_VIEW)
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, max-age=0, must-revalidate')
  async download(
    @Uuid('itemId') itemId: string,
    @Uuid('attachmentId') attachmentId: string,
    @Query('preview') preview: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { file, csp } = await this.attachments.open(itemId, attachmentId, preview === '1');
    // PDF'ler tarayıcının kendi görüntüleyicisini kullanır; CSP sandbox onu engeller (ADR-056).
    if (csp) res.setHeader('Content-Security-Policy', csp);
    return file;
  }

  @Delete('items/:itemId/attachments/:attachmentId')
  @RequireSpacePermission(S.WORK_ITEM_WRITE)
  @HttpCode(NO_CONTENT)
  async deleteAttachment(
    @Uuid('itemId') itemId: string,
    @Uuid('attachmentId') attachmentId: string,
  ): Promise<void> {
    await this.attachments.remove(itemId, attachmentId);
  }

  // ---------- Doküman sayfası ekleri (Faz 7.5) ----------

  @Post('docs/:docId/attachments')
  @RequireSpacePermission(S.DOC_WRITE)
  @UseInterceptors(FileInterceptor('file'))
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  uploadDocAttachment(
    @Uuid('docId') docId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<Created> {
    return this.attachments.upload({ kind: 'doc', id: docId }, file);
  }

  @Get('docs/:docId/attachments/:attachmentId')
  @RequireSpacePermission(S.DOC_VIEW)
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, max-age=0, must-revalidate')
  async downloadDocAttachment(
    @Uuid('docId') docId: string,
    @Uuid('attachmentId') attachmentId: string,
    @Query('preview') preview: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { file, csp } = await this.attachments.open(
      { kind: 'doc', id: docId },
      attachmentId,
      preview === '1',
    );
    if (csp) res.setHeader('Content-Security-Policy', csp);
    return file;
  }

  @Delete('docs/:docId/attachments/:attachmentId')
  @RequireSpacePermission(S.DOC_WRITE)
  @HttpCode(NO_CONTENT)
  async deleteDocAttachment(
    @Uuid('docId') docId: string,
    @Uuid('attachmentId') attachmentId: string,
  ): Promise<void> {
    await this.attachments.remove({ kind: 'doc', id: docId }, attachmentId);
  }

  // ---------- Aktivite ----------

  @Get('items/:itemId/activity')
  @RequireSpacePermission(S.SPACE_VIEW)
  @ZodResponse({ type: ActivityDto })
  itemActivity(
    @Uuid('itemId') itemId: string,
    @Query('before') before?: string,
  ): Promise<ActivityResponse> {
    return this.feed.forItem(itemId, before);
  }

  /** Ana sayfa "Son aktivite": görülebilen Space'lerdeki öğe olayları. */
  @Get('activity')
  @ZodResponse({ type: ActivityDto })
  recent(
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ): Promise<ActivityResponse> {
    return this.feed.recent(before, limit ? Number(limit) || undefined : undefined);
  }

  /** Denetim günlüğü: kim, ne zaman, ne yaptı (Faz 8.3, ADR-103). Yalnız Sahip/Yönetici. */
  @Get('audit')
  @RequirePermission(W.AUDIT_VIEW)
  @ZodResponse({ type: AuditDto })
  audit(@Query() query: AuditQueryDto): Promise<AuditResponse> {
    return this.feed.audit(query);
  }
}

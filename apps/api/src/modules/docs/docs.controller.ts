import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  CommentRequestSchema,
  CommentsResponseSchema,
  CreatedSchema,
  MentionCandidatesSchema,
  ToggleReactionRequestSchema,
  CreateDocRequestSchema,
  DocDetailSchema,
  DocsResponseSchema,
  DocVersionDetailSchema,
  DocVersionsResponseSchema,
  MoveDocRequestSchema,
  SPACE_PERMISSIONS as S,
  UpdateDocRequestSchema,
  UpdateDocResponseSchema,
  type CommentsResponse,
  type Created,
  type MentionCandidates,
  type DocDetail,
  type DocsResponse,
  type DocVersionDetail,
  type DocVersionsResponse,
  type UpdateDocResponse,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequireSpacePermission } from '../auth/decorators';
import { DocCommentsService } from './doc-comments.service';
import { DocLinksService } from './doc-links.service';
import { DocsService } from './docs.service';

class CommentsDto extends createZodDto(CommentsResponseSchema) {}
class CommentRequestDto extends createZodDto(CommentRequestSchema) {}
class CandidatesDto extends createZodDto(MentionCandidatesSchema) {}
class ReactionDto extends createZodDto(ToggleReactionRequestSchema) {}
class DocsDto extends createZodDto(DocsResponseSchema) {}
class DocDetailDto extends createZodDto(DocDetailSchema) {}
class CreateDocDto extends createZodDto(CreateDocRequestSchema) {}
class UpdateDocDto extends createZodDto(UpdateDocRequestSchema) {}
class UpdateDocResponseDto extends createZodDto(UpdateDocResponseSchema) {}
class MoveDocDto extends createZodDto(MoveDocRequestSchema) {}
class CreatedDto extends createZodDto(CreatedSchema) {}
class VersionsDto extends createZodDto(DocVersionsResponseSchema) {}
class VersionDetailDto extends createZodDto(DocVersionDetailSchema) {}

const Uuid = (name: string) => Param(name, ParseUUIDPipe);
const NO_CONTENT = HttpStatus.NO_CONTENT;

/** Doküman sayfaları (Faz 3.2, ADR-069). Okuma `doc.view`, yazma `doc.write`. */
@Controller('workspaces/:workspaceId')
export class DocsController {
  constructor(
    private readonly docs: DocsService,
    private readonly links: DocLinksService,
    private readonly comments: DocCommentsService,
  ) {}

  @Get('spaces/:spaceId/docs')
  @RequireSpacePermission(S.DOC_VIEW)
  @ZodResponse({ type: DocsDto })
  list(@Uuid('spaceId') spaceId: string): Promise<DocsResponse> {
    return this.docs.list(spaceId);
  }

  @Get('spaces/:spaceId/docs/trash')
  @RequireSpacePermission(S.DOC_VIEW)
  @ZodResponse({ type: DocsDto })
  trash(@Uuid('spaceId') spaceId: string): Promise<DocsResponse> {
    return this.docs.trash(spaceId);
  }

  @Post('spaces/:spaceId/docs')
  @RequireSpacePermission(S.DOC_WRITE)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  create(@Uuid('spaceId') spaceId: string, @Body() body: CreateDocDto): Promise<Created> {
    return this.docs.create(spaceId, body);
  }

  @Get('docs/:docId')
  @RequireSpacePermission(S.DOC_VIEW)
  @ZodResponse({ type: DocDetailDto })
  get(@Uuid('docId') docId: string): Promise<DocDetail> {
    return this.docs.get(docId);
  }

  @Patch('docs/:docId')
  @RequireSpacePermission(S.DOC_WRITE)
  @ZodResponse({ type: UpdateDocResponseDto })
  update(@Uuid('docId') docId: string, @Body() body: UpdateDocDto): Promise<UpdateDocResponse> {
    return this.docs.update(docId, body);
  }

  @Post('docs/:docId/move')
  @RequireSpacePermission(S.DOC_WRITE)
  @HttpCode(NO_CONTENT)
  move(@Uuid('docId') docId: string, @Body() body: MoveDocDto): Promise<void> {
    return this.docs.move(docId, body);
  }

  @Delete('docs/:docId')
  @RequireSpacePermission(S.DOC_WRITE)
  @HttpCode(NO_CONTENT)
  remove(@Uuid('docId') docId: string): Promise<void> {
    return this.docs.remove(docId);
  }

  @Post('docs/:docId/restore')
  @RequireSpacePermission(S.DOC_WRITE)
  @HttpCode(NO_CONTENT)
  restore(@Uuid('docId') docId: string): Promise<void> {
    return this.docs.restore(docId);
  }

  @Get('docs/:docId/versions')
  @RequireSpacePermission(S.DOC_VIEW)
  @ZodResponse({ type: VersionsDto })
  versions(@Uuid('docId') docId: string): Promise<DocVersionsResponse> {
    return this.docs.versions(docId);
  }

  @Get('docs/:docId/versions/:version')
  @RequireSpacePermission(S.DOC_VIEW)
  @ZodResponse({ type: VersionDetailDto })
  version(
    @Uuid('docId') docId: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<DocVersionDetail> {
    return this.docs.versionDetail(docId, version);
  }

  @Post('docs/:docId/versions/:version/restore')
  @RequireSpacePermission(S.DOC_WRITE)
  @ZodResponse({ type: UpdateDocResponseDto })
  restoreVersion(
    @Uuid('docId') docId: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<UpdateDocResponse> {
    return this.docs.restoreVersion(docId, version);
  }

  // ---------- Bağlantılar (ADR-070) ----------

  @Put('docs/:docId/links/:itemId')
  @RequireSpacePermission(S.DOC_WRITE)
  @HttpCode(NO_CONTENT)
  link(@Uuid('docId') docId: string, @Uuid('itemId') itemId: string): Promise<void> {
    return this.links.link(docId, itemId);
  }

  @Delete('docs/:docId/links/:itemId')
  @RequireSpacePermission(S.DOC_WRITE)
  @HttpCode(NO_CONTENT)
  unlink(@Uuid('docId') docId: string, @Uuid('itemId') itemId: string): Promise<void> {
    return this.links.unlink(docId, itemId);
  }

  // ---------- Yorumlar ----------

  @Get('docs/:docId/comments')
  @RequireSpacePermission(S.DOC_VIEW)
  @ZodResponse({ type: CommentsDto })
  async listComments(@Uuid('docId') docId: string): Promise<CommentsResponse> {
    return { comments: await this.comments.list(docId) };
  }

  @Get('docs/:docId/mention-candidates')
  @RequireSpacePermission(S.COMMENT_WRITE)
  @ZodResponse({ type: CandidatesDto })
  mentionCandidates(@Uuid('docId') docId: string, @Query('q') q = ''): Promise<MentionCandidates> {
    return this.comments.candidates(docId, q);
  }

  @Post('docs/:docId/comments')
  @RequireSpacePermission(S.COMMENT_WRITE)
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  createComment(@Uuid('docId') docId: string, @Body() body: CommentRequestDto): Promise<Created> {
    return this.comments.create(docId, body);
  }

  @Patch('docs/:docId/comments/:commentId')
  @RequireSpacePermission(S.COMMENT_WRITE)
  @HttpCode(NO_CONTENT)
  editComment(
    @Uuid('docId') docId: string,
    @Uuid('commentId') commentId: string,
    @Body() body: CommentRequestDto,
  ): Promise<void> {
    return this.comments.update(docId, commentId, body);
  }

  @Delete('docs/:docId/comments/:commentId')
  @RequireSpacePermission(S.COMMENT_WRITE)
  @HttpCode(NO_CONTENT)
  deleteComment(@Uuid('docId') docId: string, @Uuid('commentId') commentId: string): Promise<void> {
    return this.comments.remove(docId, commentId);
  }

  @Put('docs/:docId/comments/:commentId/reactions')
  @RequireSpacePermission(S.COMMENT_WRITE)
  @HttpCode(NO_CONTENT)
  toggleReaction(
    @Uuid('docId') docId: string,
    @Uuid('commentId') commentId: string,
    @Body() body: ReactionDto,
  ): Promise<void> {
    return this.comments.toggleReaction(docId, commentId, body.emoji);
  }
}

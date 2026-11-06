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
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  ConversationsResponseSchema,
  CreatedSchema,
  MESSAGE_MAX_ATTACHMENTS,
  MessagesResponseSchema,
  OpenConversationRequestSchema,
  SendMessageRequestSchema,
  type ConversationsResponse,
  type Created,
  type MessagesResponse,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { MessagesService } from './messages.service';

class ConversationsDto extends createZodDto(ConversationsResponseSchema) {}
class MessagesDto extends createZodDto(MessagesResponseSchema) {}
class OpenDto extends createZodDto(OpenConversationRequestSchema) {}
class SendDto extends createZodDto(SendMessageRequestSchema) {}
class CreatedDto extends createZodDto(CreatedSchema) {}

const Uuid = (name: string) => Param(name, ParseUUIDPipe);

/** Birebir mesajlaşma (Faz 7.8, ADR-098): Guest dışındaki workspace üyeleri. */
@Controller('workspaces/:workspaceId/conversations')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  @ZodResponse({ type: ConversationsDto })
  list(): Promise<ConversationsResponse> {
    return this.messages.list();
  }

  @Post()
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  open(@Body() body: OpenDto): Promise<Created> {
    return this.messages.open(body.userId);
  }

  @Get(':conversationId/messages')
  @ZodResponse({ type: MessagesDto })
  history(
    @Uuid('conversationId') conversationId: string,
    @Query('before') before?: string,
  ): Promise<MessagesResponse> {
    return this.messages.messages(conversationId, before);
  }

  @Post(':conversationId/messages')
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  send(@Uuid('conversationId') conversationId: string, @Body() body: SendDto): Promise<Created> {
    return this.messages.send(conversationId, body);
  }

  /** Dosya ekli mesaj: multipart `body` (metin) ve en çok 5 `files`. */
  @Post(':conversationId/messages/upload')
  @UseInterceptors(FilesInterceptor('files', MESSAGE_MAX_ATTACHMENTS + 1))
  @ZodResponse({ type: CreatedDto, status: HttpStatus.CREATED })
  sendWithFiles(
    @Uuid('conversationId') conversationId: string,
    @Body() body: { body?: string },
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ): Promise<Created> {
    return this.messages.sendWithFiles(
      conversationId,
      typeof body?.body === 'string' ? body.body : '',
      files ?? [],
    );
  }

  @Get(':conversationId/messages/:messageId/attachments/:attachmentId')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, max-age=0, must-revalidate')
  async attachment(
    @Uuid('conversationId') conversationId: string,
    @Uuid('messageId') messageId: string,
    @Uuid('attachmentId') attachmentId: string,
    @Query('preview') preview: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { file, csp } = await this.messages.openAttachment(
      conversationId,
      messageId,
      attachmentId,
      preview === '1',
    );
    if (csp) res.setHeader('Content-Security-Policy', csp);
    return file;
  }

  @Post(':conversationId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  read(@Uuid('conversationId') conversationId: string): Promise<void> {
    return this.messages.markRead(conversationId);
  }

  @Delete(':conversationId/messages/:messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Uuid('conversationId') conversationId: string,
    @Uuid('messageId') messageId: string,
  ): Promise<void> {
    return this.messages.remove(conversationId, messageId);
  }
}

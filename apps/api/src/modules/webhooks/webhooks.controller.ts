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
  CreatedWebhookSchema,
  CreateWebhookRequestSchema,
  SPACE_PERMISSIONS as S,
  UpdateWebhookRequestSchema,
  WebhookDeliveriesResponseSchema,
  WebhooksResponseSchema,
  type CreatedWebhook,
  type WebhookDeliveriesResponse,
  type WebhooksResponse,
} from '@scrum/shared';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequireSpacePermission } from '../auth/decorators';
import { WebhooksService } from './webhooks.service';

class WebhooksDto extends createZodDto(WebhooksResponseSchema) {}
class CreatedWebhookDto extends createZodDto(CreatedWebhookSchema) {}
class CreateWebhookDto extends createZodDto(CreateWebhookRequestSchema) {}
class UpdateWebhookDto extends createZodDto(UpdateWebhookRequestSchema) {}
class DeliveriesDto extends createZodDto(WebhookDeliveriesResponseSchema) {}

const Uuid = (name: string) => Param(name, ParseUUIDPipe);

/** Giden webhook'lar (Faz 6.2, ADR-087). Yönetim ve günlük `space.settings` yetkisiyle. */
@Controller('workspaces/:workspaceId/spaces/:spaceId/webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @ZodResponse({ type: WebhooksDto })
  list(@Uuid('spaceId') spaceId: string): Promise<WebhooksResponse> {
    return this.webhooks.list(spaceId);
  }

  @Post()
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @ZodResponse({ type: CreatedWebhookDto, status: HttpStatus.CREATED })
  create(
    @Uuid('spaceId') spaceId: string,
    @Body() body: CreateWebhookDto,
  ): Promise<CreatedWebhook> {
    return this.webhooks.create(spaceId, body);
  }

  @Patch(':webhookId')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  update(
    @Uuid('spaceId') spaceId: string,
    @Uuid('webhookId') webhookId: string,
    @Body() body: UpdateWebhookDto,
  ): Promise<void> {
    return this.webhooks.update(spaceId, webhookId, body);
  }

  @Delete(':webhookId')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Uuid('spaceId') spaceId: string, @Uuid('webhookId') webhookId: string): Promise<void> {
    return this.webhooks.remove(spaceId, webhookId);
  }

  @Get(':webhookId/deliveries')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @ZodResponse({ type: DeliveriesDto })
  deliveries(
    @Uuid('spaceId') spaceId: string,
    @Uuid('webhookId') webhookId: string,
  ): Promise<WebhookDeliveriesResponse> {
    return this.webhooks.deliveries(spaceId, webhookId);
  }

  @Post(':webhookId/test')
  @RequireSpacePermission(S.SPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  test(@Uuid('spaceId') spaceId: string, @Uuid('webhookId') webhookId: string): Promise<void> {
    return this.webhooks.test(spaceId, webhookId);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  CreatedGitIntegrationSchema,
  CreateGitIntegrationRequestSchema,
  GitIntegrationsResponseSchema,
  UpdateGitIntegrationRequestSchema,
  WORKSPACE_PERMISSIONS as W,
  type CreatedGitIntegration,
  type GitIntegrationsResponse,
} from '@scrum/shared';
import type { Request } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { Public, RequirePermission, SkipCsrf } from '../auth/decorators';
import { GitService } from './git.service';

class IntegrationsDto extends createZodDto(GitIntegrationsResponseSchema) {}
class CreatedIntegrationDto extends createZodDto(CreatedGitIntegrationSchema) {}
class CreateIntegrationDto extends createZodDto(CreateGitIntegrationRequestSchema) {}
class UpdateIntegrationDto extends createZodDto(UpdateGitIntegrationRequestSchema) {}

/** Git entegrasyonlarının yönetimi (workspace ayarı yetkisi). */
@Controller('workspaces/:workspaceId/git-integrations')
export class GitIntegrationsController {
  constructor(private readonly git: GitService) {}

  @Get()
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @ZodResponse({ type: IntegrationsDto })
  list(): Promise<GitIntegrationsResponse> {
    return this.git.list();
  }

  @Post()
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @ZodResponse({ type: CreatedIntegrationDto, status: HttpStatus.CREATED })
  create(@Body() body: CreateIntegrationDto): Promise<CreatedGitIntegration> {
    return this.git.create(body);
  }

  @Patch(':integrationId')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  update(@Param('integrationId') id: string, @Body() body: UpdateIntegrationDto): Promise<void> {
    return this.git.update(id, body);
  }

  @Delete(':integrationId')
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('integrationId') id: string): Promise<void> {
    return this.git.remove(id);
  }
}

/** Sağlayıcının çağırdığı herkese açık uç: oturum yok, CSRF yok; imza/token ile doğrulanır. */
@Controller('integrations/git')
export class GitReceiverController {
  constructor(private readonly git: GitService) {}

  @Post(':integrationId')
  @Public()
  @SkipCsrf()
  @HttpCode(HttpStatus.ACCEPTED)
  receive(
    @Param('integrationId') integrationId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: Request & { rawBody?: Buffer },
    @Body() body: unknown,
  ): Promise<{ linked: number }> {
    return this.git.receive(integrationId, headers, req.rawBody, body);
  }
}

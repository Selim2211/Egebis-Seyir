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
  Req,
  Res,
} from '@nestjs/common';
import {
  AcceptInvitationRequestSchema,
  AcceptInvitationResponseSchema,
  CreateInvitationsRequestSchema,
  InvitationPreviewSchema,
  InvitationsResponseSchema,
  MembersResponseSchema,
  UpdateMemberRequestSchema,
  UpdateWorkspaceSettingsRequestSchema,
  WorkspaceSettingsSchema,
  WORKSPACE_PERMISSIONS as W,
  type AcceptInvitationResponse,
  type InvitationPreview,
  type InvitationsResponse,
  type MembersResponse,
  type WorkspaceSettings,
} from '@scrum/shared';
import type { Request, Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import type { AuthUser } from '../auth/auth.constants';
import { AuthRateLimit, OptionalUser, Public, RequirePermission } from '../auth/decorators';
import { SessionService } from '../auth/session.service';
import { InvitationsService } from './invitations.service';
import { MembersService } from './members.service';
import { WorkspaceSettingsService } from './settings.service';

class MembersDto extends createZodDto(MembersResponseSchema) {}
class UpdateMemberDto extends createZodDto(UpdateMemberRequestSchema) {}
class InvitationsDto extends createZodDto(InvitationsResponseSchema) {}
class CreateInvitationsDto extends createZodDto(CreateInvitationsRequestSchema) {}
class InvitationPreviewDto extends createZodDto(InvitationPreviewSchema) {}
class AcceptInvitationDto extends createZodDto(AcceptInvitationRequestSchema) {}
class AcceptInvitationResponseDto extends createZodDto(AcceptInvitationResponseSchema) {}
class WorkspaceSettingsDto extends createZodDto(WorkspaceSettingsSchema) {}
class UpdateWorkspaceSettingsDto extends createZodDto(UpdateWorkspaceSettingsRequestSchema) {}

@Controller('workspaces/:workspaceId/members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermission(W.MEMBERS_VIEW)
  @ZodResponse({ type: MembersDto })
  async list(): Promise<MembersResponse> {
    return { members: await this.members.list() };
  }

  @Patch(':userId')
  @RequirePermission(W.MEMBERS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: UpdateMemberDto,
  ): Promise<void> {
    await this.members.change(userId, body.role);
  }

  @Delete(':userId')
  @RequirePermission(W.MEMBERS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('userId', ParseUUIDPipe) userId: string): Promise<void> {
    await this.members.change(userId, null);
  }
}

@Controller('workspaces/:workspaceId/invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  @RequirePermission(W.MEMBERS_MANAGE)
  @ZodResponse({ type: InvitationsDto })
  async list(): Promise<InvitationsResponse> {
    return { invitations: await this.invitations.listPending() };
  }

  @Post()
  @RequirePermission(W.MEMBERS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async create(@Body() body: CreateInvitationsDto): Promise<void> {
    await this.invitations.create(body.emails, body.role, body.spaceIds);
  }

  @Post(':id/resend')
  @RequirePermission(W.MEMBERS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async resend(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.invitations.resend(id);
  }

  @Delete(':id')
  @RequirePermission(W.MEMBERS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.invitations.revoke(id);
  }
}

/** Workspace genel ayarları (ADR-042). */
@Controller('workspaces/:workspaceId/settings')
export class WorkspaceSettingsController {
  constructor(private readonly settings: WorkspaceSettingsService) {}

  @Get()
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @ZodResponse({ type: WorkspaceSettingsDto })
  get(): Promise<WorkspaceSettings> {
    return this.settings.get();
  }

  @Patch()
  @RequirePermission(W.WORKSPACE_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(@Body() body: UpdateWorkspaceSettingsDto): Promise<void> {
    await this.settings.update(body);
  }
}

/** Davet bağlantısı (token ile; workspace kapsamı dışında). */
@Public()
@Controller('invitations/:token')
export class PublicInvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly sessions: SessionService,
  ) {}

  @Get()
  @ZodResponse({ type: InvitationPreviewDto })
  preview(@Param('token') token: string): Promise<InvitationPreview> {
    return this.invitations.preview(token);
  }

  @AuthRateLimit()
  @Post('accept')
  @ZodResponse({ type: AcceptInvitationResponseDto, status: HttpStatus.OK })
  async accept(
    @Param('token') token: string,
    @Body() body: AcceptInvitationDto,
    @OptionalUser() user: AuthUser | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AcceptInvitationResponse> {
    const result = await this.invitations.accept(token, body, user);
    if (result.newUserId) await this.sessions.start(res, req, result.newUserId, false);
    return { workspaceId: result.workspaceId };
  }
}

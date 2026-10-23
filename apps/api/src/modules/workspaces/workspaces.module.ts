import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminOverviewService } from './admin-overview.service';
import { InvitationsService } from './invitations.service';
import { MembersService } from './members.service';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { WorkspaceSettingsService } from './settings.service';
import {
  InvitationsController,
  MembersController,
  PublicInvitationsController,
  WorkspaceSettingsController,
} from './workspaces.controller';

@Module({
  controllers: [
    MembersController,
    InvitationsController,
    WorkspaceSettingsController,
    PublicInvitationsController,
    RolesController,
    AdminController,
  ],
  providers: [
    MembersService,
    InvitationsService,
    WorkspaceSettingsService,
    RolesService,
    AdminOverviewService,
  ],
})
export class WorkspacesModule {}

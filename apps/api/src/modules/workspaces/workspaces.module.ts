import { Module } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { MembersService } from './members.service';
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
  ],
  providers: [MembersService, InvitationsService, WorkspaceSettingsService],
})
export class WorkspacesModule {}

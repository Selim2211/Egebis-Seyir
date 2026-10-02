import { Module } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { MembersService } from './members.service';
import {
  InvitationsController,
  MembersController,
  PublicInvitationsController,
} from './workspaces.controller';

@Module({
  controllers: [MembersController, InvitationsController, PublicInvitationsController],
  providers: [MembersService, InvitationsService],
})
export class WorkspacesModule {}

import { Module } from '@nestjs/common';
import { CollabModule } from '../collab/collab.module';
import { SpacesModule } from '../spaces/spaces.module';
import { WorkItemsModule } from '../work-items/work-items.module';
import { MailboxService } from './mailbox.service';
import { TicketsService } from './tickets.service';

/** Çağrı sistemi (ADR-138): e-postadan otomatik Bug. */
@Module({
  imports: [SpacesModule, WorkItemsModule, CollabModule],
  providers: [TicketsService, MailboxService],
  exports: [TicketsService, MailboxService],
})
export class TicketsModule {}

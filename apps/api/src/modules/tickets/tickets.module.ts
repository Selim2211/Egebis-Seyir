import { Module } from '@nestjs/common';
import { SecretBoxService } from '../../infra/security/secret-box.service';
import { CollabModule } from '../collab/collab.module';
import { SpacesModule } from '../spaces/spaces.module';
import { WorkItemsModule } from '../work-items/work-items.module';
import { BugBoxService } from './bug-box.service';
import { MailboxService } from './mailbox.service';
import { TicketAiService } from './ticket-ai.service';
import { TicketCompaniesService } from './ticket-companies.service';
import { TicketConfigService } from './ticket-config.service';
import { TicketRepliesService } from './ticket-replies.service';
import { BugBoxController, TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

/** Çağrı sistemi (ADR-138, ADR-140): e-postadan otomatik Bug, firma/atama, süreç yanıtları, Bug Kutusu. */
@Module({
  imports: [SpacesModule, WorkItemsModule, CollabModule],
  controllers: [TicketsController, BugBoxController],
  providers: [
    TicketsService,
    MailboxService,
    TicketConfigService,
    TicketCompaniesService,
    TicketRepliesService,
    TicketAiService,
    BugBoxService,
    SecretBoxService,
  ],
  exports: [TicketsService, MailboxService, TicketRepliesService, TicketAiService],
})
export class TicketsModule {}

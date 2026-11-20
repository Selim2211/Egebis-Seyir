import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

/** Yapay zekâ destekli özellikler (Faz 6.5). */
@Module({ imports: [TicketsModule], controllers: [AiController], providers: [AiService] })
export class AiModule {}

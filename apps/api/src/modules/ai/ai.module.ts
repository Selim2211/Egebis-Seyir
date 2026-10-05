import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

/** Yapay zekâ destekli özellikler (Faz 6.5). */
@Module({ controllers: [AiController], providers: [AiService] })
export class AiModule {}

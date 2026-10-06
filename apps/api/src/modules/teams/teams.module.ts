import { Module } from '@nestjs/common';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

/** Ekipler (Faz 7.7). */
@Module({ controllers: [TeamsController], providers: [TeamsService] })
export class TeamsModule {}

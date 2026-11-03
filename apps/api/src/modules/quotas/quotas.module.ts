import { Global, Module } from '@nestjs/common';
import { QuotasController } from './quotas.controller';
import { QuotasService } from './quotas.service';

/** Yükleme sınırları; ek ve video servisleri denetim için kullanır (ADR-154). */
@Global()
@Module({ controllers: [QuotasController], providers: [QuotasService], exports: [QuotasService] })
export class QuotasModule {}

import { Module } from '@nestjs/common';
import { DocsController } from './docs.controller';
import { DocsService } from './docs.service';

/** Doküman sayfaları: ağaç, içerik, sürümler, çöp kutusu (Faz 3.2). */
@Module({
  controllers: [DocsController],
  providers: [DocsService],
})
export class DocsModule {}

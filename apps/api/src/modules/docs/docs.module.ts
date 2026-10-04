import { Module } from '@nestjs/common';
import { DocCommentsService } from './doc-comments.service';
import { DocLinksService } from './doc-links.service';
import { DocsController } from './docs.controller';
import { DocsService } from './docs.service';

/** Doküman sayfaları: ağaç, içerik, sürümler, çöp kutusu (Faz 3.2). */
@Module({
  controllers: [DocsController],
  providers: [DocsService, DocLinksService, DocCommentsService],
  exports: [DocLinksService, DocsService],
})
export class DocsModule {}

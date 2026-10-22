import { Module } from '@nestjs/common';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

/** Video arşivi: Proje başına klasörler, parça parça yükleme, Range ile oynatma (Faz 15). */
@Module({
  controllers: [VideosController],
  providers: [VideosService],
})
export class VideosModule {}

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Env } from '../../infra/config/env';
import { ActivityFeedService } from './activity-feed.service';
import { AttachmentsService } from './attachments.service';
import { CollabController } from './collab.controller';
import { CommentsService } from './comments.service';

/** Yorumlar, dosya ekleri ve aktivite akışları (Faz 1.6). */
@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        // Dosya belleğe alınır, doğrulanır ve ardından depolamaya yazılır (ADR-056).
        storage: memoryStorage(),
        limits: { fileSize: config.get('MAX_UPLOAD_MB', { infer: true }) * 1024 * 1024, files: 1 },
      }),
    }),
  ],
  controllers: [CollabController],
  providers: [CommentsService, AttachmentsService, ActivityFeedService],
})
export class CollabModule {}

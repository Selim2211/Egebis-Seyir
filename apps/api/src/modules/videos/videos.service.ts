import type { Readable } from 'node:stream';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ERROR_CODES,
  looksLikeVideo,
  VIDEO_CHUNK_BYTES,
  VIDEO_CHUNK_MAX_BYTES,
  videoMimeOf,
  type CreateVideoFolderRequest,
  type CreateVideoRequest,
  type Created,
  type UpdateVideoFolderRequest,
  type UpdateVideoRequest,
  type Video,
  type VideoProgress,
  type VideosResponse,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import type { Env } from '../../infra/config/env';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { StorageLimitError, StorageService } from '../../infra/storage/storage.service';
import { notFound } from '../spaces/space-errors';
import { fail } from '../work-items/item-support';

const HEADER_BYTES = 16;

const videoSelect = {
  id: true,
  title: true,
  description: true,
  fileName: true,
  mime: true,
  size: true,
  received: true,
  status: true,
  folderId: true,
  createdAt: true,
  uploadedBy: { select: { id: true, name: true } },
} as const;

type VideoRow = {
  id: string;
  title: string;
  description: string;
  fileName: string;
  mime: string;
  size: bigint;
  received: bigint;
  status: 'UPLOADING' | 'READY';
  folderId: string | null;
  createdAt: Date;
  uploadedBy: { id: string; name: string } | null;
};

const toVideo = (row: VideoRow): Video => ({
  ...row,
  size: Number(row.size),
  received: Number(row.received),
  createdAt: row.createdAt.toISOString(),
});

/**
 * Video arşivi (Faz 15, ADR-129): Proje başına klasörler ve videolar. Büyük dosyalar belleğe alınmadan
 * parça parça diske eklenir (devam ettirilebilir: her parça mevcut `received` ofsetinden gönderilir),
 * tamamlanınca boyut ve içerik imzası doğrulanır. Oynatma HTTP Range ile yapılır.
 */
@Injectable()
export class VideosService {
  readonly maxBytes: number;

  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly storage: StorageService,
    config: ConfigService<Env, true>,
  ) {
    this.maxBytes = config.get('MAX_VIDEO_MB', { infer: true }) * 1024 * 1024;
  }

  async list(spaceId: string): Promise<VideosResponse> {
    const db = this.tenant.db;
    const [folders, videos] = await Promise.all([
      db.videoFolder.findMany({
        where: { spaceId },
        select: { id: true, name: true, parentId: true },
        orderBy: { name: 'asc' },
      }),
      db.video.findMany({
        where: { spaceId },
        select: videoSelect,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      folders,
      videos: videos.map(toVideo),
      maxBytes: this.maxBytes,
      chunkBytes: VIDEO_CHUNK_BYTES,
    };
  }

  async create(spaceId: string, input: CreateVideoRequest): Promise<Created> {
    const mime = videoMimeOf(input.fileName);
    if (!mime) throw fail(ERROR_CODES.VIDEO_TYPE_UNSUPPORTED);
    if (input.size > this.maxBytes) {
      throw fail(ERROR_CODES.VIDEO_TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE, {
        maxMb: Math.round(this.maxBytes / 1024 / 1024),
      });
    }
    await this.assertFolder(spaceId, input.folderId);
    const workspaceId = this.cls.get('workspaceId')!;
    const storageKey = `${workspaceId}/videos/${crypto.randomUUID()}`;
    const row = await this.tenant.db.video.create({
      data: {
        workspaceId,
        spaceId,
        folderId: input.folderId,
        title: input.title,
        fileName: input.fileName,
        mime,
        size: BigInt(input.size),
        storageKey,
        uploadedById: this.cls.get('userId')!,
      },
      select: { id: true },
    });
    return { id: row.id };
  }

  /**
   * Bir parçayı ekler. `offset` sunucunun aldığı bayta eşit olmalıdır; değilse 409 ile güncel ofset döner
   * (istemci kaldığı yerden devam eder). Toplam boyut aşılırsa parça geri alınır.
   */
  async appendChunk(videoId: string, offset: number, body: Readable): Promise<VideoProgress> {
    const db = this.tenant.db;
    const video = await db.video.findFirst({
      where: { id: videoId },
      select: { id: true, size: true, received: true, status: true, storageKey: true },
    });
    if (!video) throw notFound();
    if (video.status === 'READY') return { received: Number(video.received) };
    const received = Number(video.received);
    if (offset !== received) {
      throw fail(ERROR_CODES.VIDEO_UPLOAD_OFFSET, HttpStatus.CONFLICT, { received });
    }
    const remaining = Number(video.size) - received;
    const allowed = Math.min(VIDEO_CHUNK_MAX_BYTES, remaining);
    let written: number;
    try {
      written = await this.storage.append(video.storageKey, body, allowed);
    } catch (error) {
      // Yarım parça diskten geri alınır; kayıt eski ofsette kalır.
      await this.storage.truncate(video.storageKey, received).catch(() => undefined);
      if (error instanceof StorageLimitError) {
        throw fail(ERROR_CODES.VIDEO_TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE);
      }
      throw error;
    }
    const next = received + written;
    await db.video.update({ where: { id: videoId }, data: { received: BigInt(next) } });
    return { received: next };
  }

  /** Tüm baytlar geldiyse içerik imzasını doğrular ve videoyu oynatılabilir yapar. */
  async complete(videoId: string): Promise<void> {
    const db = this.tenant.db;
    const video = await db.video.findFirst({
      where: { id: videoId },
      select: { size: true, received: true, mime: true, storageKey: true, status: true },
    });
    if (!video) throw notFound();
    if (video.status === 'READY') return;
    const onDisk = await this.storage.size(video.storageKey);
    if (Number(video.received) !== Number(video.size) || onDisk !== Number(video.size)) {
      throw fail(ERROR_CODES.VIDEO_UPLOAD_INCOMPLETE, HttpStatus.CONFLICT, {
        received: Number(video.received),
      });
    }
    const head = await this.storage.head(video.storageKey, HEADER_BYTES);
    if (!looksLikeVideo(video.mime, head)) {
      await this.storage.remove(video.storageKey);
      await db.video.delete({ where: { id: videoId } });
      throw fail(ERROR_CODES.VIDEO_INVALID);
    }
    await db.video.update({ where: { id: videoId }, data: { status: 'READY' } });
  }

  /** Oynatma için dosya bilgisi; yalnızca tamamlanmış videolar. */
  async source(videoId: string) {
    const video = await this.tenant.db.video.findFirst({
      where: { id: videoId },
      select: { storageKey: true, mime: true, size: true, status: true },
    });
    if (!video) throw notFound();
    if (video.status !== 'READY') throw fail(ERROR_CODES.VIDEO_NOT_READY, HttpStatus.CONFLICT);
    return { key: video.storageKey, mime: video.mime, size: Number(video.size) };
  }

  async update(videoId: string, input: UpdateVideoRequest): Promise<void> {
    const db = this.tenant.db;
    const video = await db.video.findFirst({ where: { id: videoId }, select: { spaceId: true } });
    if (!video) throw notFound();
    if (input.folderId !== undefined) await this.assertFolder(video.spaceId, input.folderId);
    await db.video.update({ where: { id: videoId }, data: input });
  }

  async remove(videoId: string): Promise<void> {
    const db = this.tenant.db;
    const video = await db.video.findFirst({
      where: { id: videoId },
      select: { storageKey: true },
    });
    if (!video) throw notFound();
    await db.video.delete({ where: { id: videoId } });
    await this.storage.remove(video.storageKey);
  }

  // ---------- Klasörler ----------

  async createFolder(spaceId: string, input: CreateVideoFolderRequest): Promise<Created> {
    await this.assertFolder(spaceId, input.parentId);
    const row = await this.tenant.db.videoFolder.create({
      data: {
        workspaceId: this.cls.get('workspaceId'),
        spaceId,
        name: input.name,
        parentId: input.parentId,
      },
      select: { id: true },
    });
    return { id: row.id };
  }

  async renameFolder(folderId: string, input: UpdateVideoFolderRequest): Promise<void> {
    const db = this.tenant.db;
    const folder = await db.videoFolder.findFirst({
      where: { id: folderId },
      select: { id: true },
    });
    if (!folder) throw notFound();
    await db.videoFolder.update({ where: { id: folderId }, data: { name: input.name } });
  }

  /** Klasör ve alt klasörleri silinir; içlerindeki videolar silinmez, köke düşer. */
  async removeFolder(folderId: string): Promise<void> {
    const db = this.tenant.db;
    const folder = await db.videoFolder.findFirst({
      where: { id: folderId },
      select: { id: true },
    });
    if (!folder) throw notFound();
    await db.videoFolder.delete({ where: { id: folderId } });
  }

  private async assertFolder(spaceId: string, folderId: string | null) {
    if (!folderId) return;
    const folder = await this.tenant.db.videoFolder.findFirst({
      where: { id: folderId, spaceId },
      select: { id: true },
    });
    if (!folder) throw fail(ERROR_CODES.VIDEO_FOLDER_INVALID);
  }
}

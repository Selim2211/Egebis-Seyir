import { Injectable, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  checkUpload,
  ERROR_CODES,
  isPreviewable,
  MAX_ATTACHMENTS_PER_ITEM,
  safeDownloadName,
  type Attachment,
  type Created,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import type { Env } from '../../infra/config/env';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { StorageService } from '../../infra/storage/storage.service';
import { ActivityService } from '../activity/activity.service';
import { notFound } from '../spaces/space-errors';
import { fail } from '../work-items/item-support';

const HEADER_BYTES = 16;

/** Multer'ın `originalname` değeri latin1 çözülür; UTF-8 adı geri kazanır. */
const decodeName = (name: string) => Buffer.from(name, 'latin1').toString('utf8');

export const toAttachmentDto = (row: {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  uploader: { id: string; name: string } | null;
}): Attachment => ({
  id: row.id,
  fileName: row.fileName,
  mimeType: row.mimeType,
  size: row.size,
  createdAt: row.createdAt.toISOString(),
  uploader: row.uploader,
  previewable: isPreviewable(row.mimeType),
});

/** Dosya ekleri (ADR-056): yükleme, güvenli sunum, silme. */
@Injectable()
export class AttachmentsService {
  private readonly maxBytes: number;

  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly storage: StorageService,
    private readonly activity: ActivityService,
    config: ConfigService<Env, true>,
  ) {
    this.maxBytes = config.get('MAX_UPLOAD_MB', { infer: true }) * 1024 * 1024;
  }

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  private async activeItem(itemId: string) {
    const item = await this.tenant.db.workItem.findFirst({
      where: { id: itemId, deletedAt: null, list: { deletedAt: null }, space: { deletedAt: null } },
      select: { id: true },
    });
    if (!item) throw notFound();
  }

  async upload(itemId: string, file: Express.Multer.File | undefined): Promise<Created> {
    const { workspaceId, actorId } = this.ctx;
    if (!file) throw fail(ERROR_CODES.ATTACHMENT_INVALID, 400);
    await this.activeItem(itemId);
    const db = this.tenant.db;

    if (
      (await db.attachment.count({ where: { workItemId: itemId } })) >= MAX_ATTACHMENTS_PER_ITEM
    ) {
      throw fail(ERROR_CODES.ATTACHMENT_LIMIT);
    }
    const fileName = decodeName(file.originalname).trim();
    const check = checkUpload({
      fileName,
      size: file.size,
      maxBytes: this.maxBytes,
      header: file.buffer.subarray(0, HEADER_BYTES),
    });
    if (!check.ok) throw fail(check.code, check.code === 'ATTACHMENT_TOO_LARGE' ? 413 : 422);

    const storageKey = await this.storage.put(workspaceId, file.buffer);
    try {
      return await db.$transaction(async (tx) => {
        const row = await tx.attachment.create({
          data: {
            workspaceId,
            workItemId: itemId,
            uploaderId: actorId,
            fileName,
            mimeType: check.mime,
            size: file.size,
            storageKey,
          },
        });
        await this.activity.record(tx, {
          workspaceId,
          actorId,
          entityType: 'item',
          entityId: itemId,
          action: 'item.attachment_added',
          changes: { fileName, size: file.size },
        });
        return { id: row.id };
      });
    } catch (error) {
      await this.storage.remove(storageKey);
      throw error;
    }
  }

  /**
   * İndirme veya önizleme. Satır içi gösterim yalnızca güvenli türlerde ve yalnızca `preview`
   * istendiğinde; diğer her şey `attachment` olarak iner (ADR-056).
   */
  async open(
    itemId: string,
    attachmentId: string,
    preview: boolean,
  ): Promise<{ file: StreamableFile; csp: string | null }> {
    await this.activeItem(itemId);
    const row = await this.tenant.db.attachment.findFirst({
      where: { id: attachmentId, workItemId: itemId },
    });
    if (!row || !(await this.storage.exists(row.storageKey))) throw notFound();
    const inline = preview && isPreviewable(row.mimeType);
    const name = safeDownloadName(row.fileName);
    const file = new StreamableFile(this.storage.open(row.storageKey), {
      type: row.mimeType,
      length: row.size,
      disposition: `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
    });
    return { file, csp: row.mimeType === 'application/pdf' ? null : "default-src 'none'; sandbox" };
  }

  async remove(itemId: string, attachmentId: string): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    await this.activeItem(itemId);
    const row = await this.tenant.db.$transaction(async (tx) => {
      const found = await tx.attachment.findFirst({
        where: { id: attachmentId, workItemId: itemId },
      });
      if (!found) throw notFound();
      await tx.attachment.delete({ where: { id: attachmentId } });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'item',
        entityId: itemId,
        action: 'item.attachment_removed',
        changes: { fileName: found.fileName },
      });
      return found;
    });
    await this.storage.remove(row.storageKey);
  }
}

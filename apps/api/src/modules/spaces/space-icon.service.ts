import { randomBytes } from 'node:crypto';
import { Injectable, StreamableFile } from '@nestjs/common';
import { checkSpaceIcon, ERROR_CODES, sniffMime } from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { StorageService } from '../../infra/storage/storage.service';
import { ActivityService } from '../activity/activity.service';
import { fail } from '../work-items/item-support';
import { notFound } from './space-errors';

const keyOf = (workspaceId: string, spaceId: string) => `space-icons/${workspaceId}/${spaceId}`;

/**
 * Proje ikonu olarak yüklenen resim (yönetici 5. tur, ADR-176). Tarayıcı resmi 128×128'e küçültür;
 * sunucu içeriği doğrular. Sürüm adreste olduğu için tarayıcı önbelleği güvenle kullanılır.
 */
@Injectable()
export class SpaceIconService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly storage: StorageService,
    private readonly activity: ActivityService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async set(spaceId: string, file: Express.Multer.File | undefined): Promise<string> {
    if (!file || !checkSpaceIcon(file.buffer).ok) throw fail(ERROR_CODES.SPACE_ICON_INVALID, 422);
    const workspaceId = this.cls.get('workspaceId')!;
    await this.ensureSpace(spaceId);
    await this.storage.write(keyOf(workspaceId, spaceId), file.buffer);
    const version = randomBytes(6).toString('hex');
    await this.record(spaceId, version);
    return version;
  }

  async clear(spaceId: string): Promise<void> {
    const workspaceId = this.cls.get('workspaceId')!;
    await this.ensureSpace(spaceId);
    await this.record(spaceId, null);
    await this.storage.remove(keyOf(workspaceId, spaceId));
  }

  async open(spaceId: string): Promise<StreamableFile> {
    const workspaceId = this.cls.get('workspaceId')!;
    const space = await this.tenant.db.space.findFirst({
      where: { id: spaceId, deletedAt: null },
      select: { iconImageVersion: true },
    });
    const key = keyOf(workspaceId, spaceId);
    if (!space?.iconImageVersion || !(await this.storage.exists(key))) throw notFound();
    const mime = sniffMime(await this.storage.head(key, 16)) ?? 'application/octet-stream';
    return new StreamableFile(this.storage.open(key), { type: mime });
  }

  private async ensureSpace(spaceId: string): Promise<void> {
    const space = await this.tenant.db.space.findFirst({
      where: { id: spaceId, deletedAt: null },
      select: { id: true },
    });
    if (!space) throw notFound();
  }

  private async record(spaceId: string, version: string | null): Promise<void> {
    const workspaceId = this.cls.get('workspaceId')!;
    await this.tenant.db.$transaction(async (tx) => {
      await tx.space.update({ where: { id: spaceId }, data: { iconImageVersion: version } });
      await this.activity.record(tx, {
        workspaceId,
        actorId: this.cls.get('userId')!,
        entityType: 'space',
        entityId: spaceId,
        action: 'space.updated',
        changes: { iconImage: version ? 'set' : 'removed' },
      });
    });
  }
}

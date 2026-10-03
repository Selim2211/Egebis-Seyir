import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  SPACE_PERMISSIONS as S,
  TRASH_RETENTION_DAYS,
  type ArchiveEntry,
  type ArchiveResponse,
  formatItemKey,
  type ArchiveType,
  type FavoriteType,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { StorageService } from '../../infra/storage/storage.service';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { QueueService } from '../../infra/queue/queue.service';
import { SpaceAccessService } from '../access/space-access.service';
import { ActivityService } from '../activity/activity.service';
import { notFound } from './space-errors';

export type LifecycleAction = 'archive' | 'unarchive' | 'delete' | 'restore';

interface LifecycleRow {
  archivedAt: Date | null;
  deletedAt: Date | null;
}

/** Space, Folder ve List tablolarının ortak arşiv/çöp alanları. */
interface LifecycleDelegate {
  findFirst(args: {
    where: { id: string };
    select: { archivedAt: true; deletedAt: true };
  }): Promise<LifecycleRow | null>;
  update(args: {
    where: { id: string };
    data: { archivedAt?: Date | null; deletedAt?: Date | null; deletedById?: string | null };
  }): Promise<unknown>;
}

const ENTITY = { SPACE: 'space', FOLDER: 'folder', LIST: 'list' } as const;
const DAY = 24 * 60 * 60 * 1000;
export const PURGE_JOB = 'trash.purge';

/** Arşiv ve çöp kutusu (ADR-041). */
@Injectable()
export class LifecycleService implements OnModuleInit {
  private readonly logger = new Logger(LifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly access: SpaceAccessService,
    private readonly activity: ActivityService,
    private readonly queue: QueueService,
    private readonly storage: StorageService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Her gece 03:30: süresi dolan çöp kutusu öğelerini kalıcı siler.
    await this.queue.schedule(PURGE_JOB, '30 3 * * *', () => this.purgeExpired().then(() => {}));
  }

  /** Arşivle, arşivden çıkar, çöp kutusuna at veya geri getir. İzin guard'da kontrol edilir. */
  async change(type: FavoriteType, id: string, action: LifecycleAction): Promise<void> {
    const workspaceId = this.cls.get('workspaceId')!;
    const actorId = this.cls.get('userId')!;
    await this.tenant.db.$transaction(async (tx) => {
      const delegate = (type === 'SPACE'
        ? tx.space
        : type === 'FOLDER'
          ? tx.folder
          : tx.list) as unknown as LifecycleDelegate;
      const row = await delegate.findFirst({
        where: { id },
        select: { archivedAt: true, deletedAt: true },
      });
      if (!row) throw notFound();
      // Çöp kutusundaki öğe yalnızca geri getirilebilir; çöpte olmayan geri getirilemez.
      if ((row.deletedAt !== null) !== (action === 'restore')) throw notFound();

      const now = new Date();
      const data =
        action === 'archive'
          ? { archivedAt: row.archivedAt ?? now }
          : action === 'unarchive'
            ? { archivedAt: null }
            : action === 'delete'
              ? { deletedAt: now, deletedById: actorId }
              : { deletedAt: null, deletedById: null };
      await delegate.update({ where: { id }, data });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: ENTITY[type],
        entityId: id,
        action: `${ENTITY[type]}.${action === 'delete' ? 'trashed' : action === 'restore' ? 'restored' : `${action}d`}`,
      });
    });
  }

  /** Kullanıcının geri getirebildiği arşivlenmiş ve silinmiş öğeler. */
  async list(): Promise<ArchiveResponse> {
    const db = this.tenant.db;
    const perms = await this.access.permissionMap();
    const can = (spaceId: string, permission: string) =>
      perms.get(spaceId)?.includes(permission) ?? false;
    const ids = [...perms.keys()];
    const spaceSelect = { select: { name: true, deletedAt: true } } as const;

    const [spaces, folders, lists, items] = await Promise.all([
      db.space.findMany({
        where: {
          id: { in: ids },
          OR: [{ archivedAt: { not: null } }, { deletedAt: { not: null } }],
        },
      }),
      db.folder.findMany({
        where: {
          spaceId: { in: ids },
          space: { deletedAt: null },
          OR: [{ archivedAt: { not: null } }, { deletedAt: { not: null } }],
        },
        include: { space: spaceSelect },
      }),
      db.list.findMany({
        where: {
          spaceId: { in: ids },
          space: { deletedAt: null },
          AND: [
            { OR: [{ folderId: null }, { folder: { deletedAt: null } }] },
            { OR: [{ archivedAt: { not: null } }, { deletedAt: { not: null } }] },
          ],
        },
        include: { space: spaceSelect, folder: { select: { name: true } } },
      }),
      db.workItem.findMany({
        where: {
          spaceId: { in: ids },
          space: { deletedAt: null },
          list: { deletedAt: null },
          OR: [{ archivedAt: { not: null } }, { deletedAt: { not: null } }],
        },
        include: {
          space: spaceSelect,
          list: { select: { name: true } },
          parent: { select: { archivedAt: true, deletedAt: true } },
        },
      }),
    ]);

    const deleterIds = [...spaces, ...folders, ...lists, ...items].flatMap((r) =>
      r.deletedById ? [r.deletedById] : [],
    );
    const deleters = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: deleterIds } },
          select: { id: true, name: true },
        })
      ).map((u) => [u.id, u.name]),
    );

    const archived: ArchiveEntry[] = [];
    const trash: ArchiveEntry[] = [];
    const push = (
      row: {
        id: string;
        name: string;
        archivedAt: Date | null;
        deletedAt: Date | null;
        deletedById: string | null;
      },
      type: ArchiveType,
      location: string | null,
    ) => {
      const deleted = row.deletedAt !== null;
      (deleted ? trash : archived).push({
        type,
        id: row.id,
        name: row.name,
        location,
        at: (deleted ? row.deletedAt! : row.archivedAt!).toISOString(),
        by: deleted && row.deletedById ? (deleters.get(row.deletedById) ?? null) : null,
      });
    };

    for (const s of spaces) if (can(s.id, S.SPACE_SETTINGS)) push(s, 'SPACE', null);
    for (const f of folders) if (can(f.spaceId, S.LIST_MANAGE)) push(f, 'FOLDER', f.space.name);
    for (const l of lists) {
      if (!can(l.spaceId, S.LIST_MANAGE)) continue;
      push(l, 'LIST', l.folder ? `${l.space.name} › ${l.folder.name}` : l.space.name);
    }
    for (const item of items) {
      if (!can(item.spaceId, S.WORK_ITEM_WRITE)) continue;
      // Alt öğeler üst öğeyle birlikte işlendiyse ayrıca listelenmez.
      const same = (a: Date | null, b: Date | null) => a !== null && a.getTime() === b?.getTime();
      const deleted = item.deletedAt !== null;
      const withParent = deleted
        ? same(item.deletedAt, item.parent?.deletedAt ?? null)
        : item.parent?.deletedAt === null && same(item.archivedAt, item.parent.archivedAt);
      if (withParent) continue;
      push(
        { ...item, name: `${formatItemKey(item.keyPrefix, item.number)} ${item.title}` },
        'ITEM',
        `${item.space.name} › ${item.list.name}`,
      );
    }
    const byDate = (a: ArchiveEntry, b: ArchiveEntry) => b.at.localeCompare(a.at);
    return {
      archived: archived.sort(byDate),
      trash: trash.sort(byDate),
      retentionDays: TRASH_RETENTION_DAYS,
    };
  }

  /** Süresi dolan çöp kutusu öğelerini tüm workspace'lerde kalıcı siler (sistem işi). */
  async purgeExpired(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * DAY);
    const expired = { deletedAt: { lt: cutoff } };
    // Öğe, List, Folder veya Space süresi dolduğu için silinecek öğelerin ek dosyaları (ADR-056).
    const doomed = await this.prisma.attachment.findMany({
      where: {
        workItem: {
          OR: [
            { deletedAt: { lt: cutoff } },
            { list: { deletedAt: { lt: cutoff } } },
            { list: { folder: { deletedAt: { lt: cutoff } } } },
            { space: { deletedAt: { lt: cutoff } } },
          ],
        },
      },
      select: { storageKey: true },
    });
    const counts = await this.prisma.$transaction([
      this.prisma.workItem.deleteMany({ where: expired }),
      this.prisma.list.deleteMany({ where: expired }),
      this.prisma.folder.deleteMany({ where: expired }),
      this.prisma.space.deleteMany({ where: expired }),
      // Süresi dolan doküman sayfaları (ADR-069); alt sayfalar zincirleme silinir.
      this.prisma.doc.deleteMany({ where: expired }),
      // Silinen kayıtlara işaret eden favoriler.
      this.prisma.$executeRaw`
        DELETE FROM favorites f WHERE
          (f.type = 'SPACE' AND NOT EXISTS (SELECT 1 FROM spaces s WHERE s.id = f."entityId")) OR
          (f.type = 'FOLDER' AND NOT EXISTS (SELECT 1 FROM folders d WHERE d.id = f."entityId")) OR
          (f.type = 'LIST' AND NOT EXISTS (SELECT 1 FROM lists l WHERE l.id = f."entityId"))`,
    ]);
    const total = counts
      .slice(0, 4)
      .reduce<number>((sum, c) => sum + (c as { count: number }).count, 0);
    await Promise.all(doomed.map((a) => this.storage.remove(a.storageKey)));
    if (total > 0) this.logger.log(`Çöp kutusundan ${total} öğe kalıcı silindi`);
    return total;
  }
}

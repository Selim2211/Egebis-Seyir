import { Injectable } from '@nestjs/common';
import { formatItemKey, type DocLinkedItem } from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { SpaceAccessService } from '../access/space-access.service';
import { ActivityService } from '../activity/activity.service';
import { archivedParent, notFound } from '../spaces/space-errors';
import { asJson } from '../work-items/item-support';

/** Doküman sayfası ↔ iş öğesi bağlantıları (Faz 3.3, ADR-070). */
@Injectable()
export class DocLinksService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly access: SpaceAccessService,
    private readonly activity: ActivityService,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  /** Sayfaya bağlı öğeler; görüntüleyenin göremediği Space'tekiler elenir. */
  async itemsOfDoc(docId: string): Promise<DocLinkedItem[]> {
    const rows = await this.tenant.db.docItemLink.findMany({
      where: { docId, workItem: { deletedAt: null } },
      include: { workItem: { include: { status: { select: { category: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    const visible = await this.access.permissionMap({
      id: { in: [...new Set(rows.map((r) => r.workItem.spaceId))] },
      deletedAt: null,
    });
    return rows
      .filter((r) => visible.has(r.workItem.spaceId))
      .map((r) => ({
        id: r.workItem.id,
        key: formatItemKey(r.workItem.keyPrefix, r.workItem.number),
        type: r.workItem.type,
        title: r.workItem.title,
        category: r.workItem.status.category,
      }));
  }

  /** Öğeye bağlı sayfalar (silinmemiş, görülebilir Space'lerde). */
  async docsOfItem(itemId: string): Promise<Array<{ id: string; title: string; spaceId: string }>> {
    const rows = await this.tenant.db.docItemLink.findMany({
      where: { workItemId: itemId, doc: { deletedAt: null } },
      include: { doc: { select: { id: true, title: true, spaceId: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const visible = await this.access.permissionMap({
      id: { in: [...new Set(rows.map((r) => r.doc.spaceId))] },
      deletedAt: null,
    });
    return rows.filter((r) => visible.has(r.doc.spaceId)).map((r) => r.doc);
  }

  async link(docId: string, itemId: string): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    const doc = await db.doc.findFirst({ where: { id: docId, deletedAt: null } });
    if (!doc) throw notFound();
    const space = await db.space.findFirst({
      where: { id: doc.spaceId },
      select: { archivedAt: true },
    });
    if (space?.archivedAt) throw archivedParent();
    const item = await db.workItem.findFirst({
      where: { id: itemId, deletedAt: null },
      select: { spaceId: true, title: true },
    });
    if (!item) throw notFound();
    // Görmediği Space'teki öğeyi bağlayamaz; varlığı da sızmaz.
    const visible = await this.access.permissionMap({ id: item.spaceId, deletedAt: null });
    if (!visible.has(item.spaceId)) throw notFound();

    const existing = await db.docItemLink.findUnique({
      where: { docId_workItemId: { docId, workItemId: itemId } },
    });
    if (existing) return;
    await db.$transaction(async (tx) => {
      await tx.docItemLink.create({
        data: { workspaceId, docId, workItemId: itemId, createdById: actorId },
      });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'doc',
        entityId: docId,
        action: 'doc.item_linked',
        changes: asJson({ title: doc.title, itemId, itemTitle: item.title }),
      });
    });
  }

  async unlink(docId: string, itemId: string): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    const doc = await db.doc.findFirst({ where: { id: docId, deletedAt: null } });
    if (!doc) throw notFound();
    await db.$transaction(async (tx) => {
      const result = await tx.docItemLink.deleteMany({ where: { docId, workItemId: itemId } });
      if (result.count === 0) return;
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'doc',
        entityId: docId,
        action: 'doc.item_unlinked',
        changes: asJson({ title: doc.title, itemId }),
      });
    });
  }
}

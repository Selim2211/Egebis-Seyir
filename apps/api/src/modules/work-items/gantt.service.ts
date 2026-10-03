import { Injectable } from '@nestjs/common';
import {
  analyzeSchedule,
  epicProgress,
  formatItemKey,
  SPACE_PERMISSIONS as S,
  type Gantt,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { notFound } from '../spaces/space-errors';
import { dateOnly } from './item-support';

/** Gantt verisi: tarihli işler, bağımlılıklar ve kritik yol (Faz 4.5, ADR-077). */
@Injectable()
export class GanttService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async gantt(spaceId: string): Promise<Gantt> {
    const db = this.tenant.db;
    const space = await db.space.findFirst({
      where: { id: spaceId, deletedAt: null },
      select: { id: true, archivedAt: true },
    });
    if (!space) throw notFound();

    const rows = await db.workItem.findMany({
      where: { spaceId, deletedAt: null, archivedAt: null },
      select: {
        id: true,
        keyPrefix: true,
        number: true,
        type: true,
        title: true,
        parentId: true,
        startDate: true,
        dueDate: true,
        points: true,
        color: true,
        status: { select: { category: true } },
      },
    });
    const links = await db.workItemLink.findMany({
      where: {
        type: 'BLOCKS',
        from: { spaceId, deletedAt: null },
        to: { spaceId, deletedAt: null },
      },
      select: { fromId: true, toId: true },
    });
    const dependencies = links.map((l) => ({ from: l.fromId, to: l.toId }));
    const linked = new Set(dependencies.flatMap((d) => [d.from, d.to]));

    // Çubuk için en az bir tarih gerekir; bağımlılığı olan tarihsiz iş de listelenir (1 günlük sayılır).
    const items = rows.filter((r) => r.startDate || r.dueDate || linked.has(r.id));
    const children = new Map<string, typeof rows>();
    for (const r of rows) {
      if (r.parentId) children.set(r.parentId, [...(children.get(r.parentId) ?? []), r]);
    }

    const analysis = analyzeSchedule(
      items.map((i) => ({
        id: i.id,
        startDate: dateOnly(i.startDate),
        dueDate: dateOnly(i.dueDate),
      })),
      dependencies,
    );

    return {
      items: items.map((i) => ({
        id: i.id,
        key: formatItemKey(i.keyPrefix, i.number),
        type: i.type,
        title: i.title,
        parentId: i.parentId,
        startDate: dateOnly(i.startDate),
        dueDate: dateOnly(i.dueDate),
        category: i.status.category,
        progress:
          i.type === 'EPIC'
            ? epicProgress(
                (children.get(i.id) ?? []).map((c) => ({
                  points: c.points,
                  category: c.status.category,
                })),
              )
            : i.status.category === 'DONE'
              ? 100
              : 0,
        color: i.color,
      })),
      dependencies: dependencies.filter(
        (d) => items.some((i) => i.id === d.from) && items.some((i) => i.id === d.to),
      ),
      criticalPath: analysis.criticalPath,
      criticalDays: analysis.criticalDays,
      hasCycle: analysis.hasCycle,
      violations: analysis.violations,
      canEdit:
        (this.cls.get('spacePermissions') ?? []).includes(S.WORK_ITEM_WRITE) && !space.archivedAt,
    };
  }
}

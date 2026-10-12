import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatItemKey } from '@scrum/shared';
import type { Env } from '../../infra/config/env';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { dateOnly } from '../work-items/item-support';
import { notFound } from '../spaces/space-errors';
import { countedItems, summarize } from './sprint-support';

/** JSON dışa aktarma biçimi sürümü; alan eklenince değil, anlam değişince artar. */
export const SPRINT_JSON_VERSION = 1;

/**
 * Sprint'i makine tarafından okunabilir JSON olarak dışa aktarır (Faz 9, ADR-107): sprint özellikleri,
 * toplam puan/yüzde, kişi dağılımı, öğeler (alt görevler dahil), bağımlılıklar ve her kaydın bağlantısı.
 */
@Injectable()
export class SprintJsonService {
  private readonly appUrl: string;

  constructor(
    private readonly tenant: TenantPrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  async exportSprint(sprintId: string) {
    const db = this.tenant.db;
    const sprint = await db.sprint.findFirst({ where: { id: sprintId } });
    if (!sprint) throw notFound();
    const [summary] = await summarize(db, [sprint]);
    const rows = await db.workItem.findMany({
      where: { OR: [{ sprintId }, { parent: { sprintId } }], ...countedItems },
      orderBy: [{ backlogRank: 'asc' }, { createdAt: 'asc' }],
      include: {
        status: { select: { name: true, category: true } },
        parent: { select: { keyPrefix: true, number: true } },
        assignees: { select: { user: { select: { name: true, email: true } } } },
        labels: { select: { label: { select: { name: true } } } },
      },
    });
    const ids = rows.map((r) => r.id);
    const keyOf = new Map(rows.map((r) => [r.id, formatItemKey(r.keyPrefix, r.number)]));
    const links = await db.workItemLink.findMany({
      where: { fromId: { in: ids }, toId: { in: ids } },
      select: { fromId: true, toId: true, type: true },
    });
    const url = (path: string) => `${this.appUrl}${path}`;
    return {
      name: sprint.name,
      data: {
        format: 'egebis-seyir.sprint',
        version: SPRINT_JSON_VERSION,
        exportedAt: new Date().toISOString(),
        sprint: {
          id: sprint.id,
          url: url(`/sprints/${sprint.id}`),
          name: sprint.name,
          goal: sprint.goal,
          startDate: dateOnly(sprint.startDate),
          endDate: dateOnly(sprint.endDate),
          status: sprint.status,
          capacityNote: sprint.capacityNote,
        },
        summary: summary && {
          itemCount: summary.itemCount,
          points: summary.points,
          donePoints: summary.donePoints,
          percentDone: summary.percentDone,
          byAssignee: summary.byAssignee,
        },
        items: rows.map((row) => {
          const key = keyOf.get(row.id)!;
          return {
            key,
            url: url(`/items/${encodeURIComponent(key)}`),
            type: row.type,
            title: row.title,
            status: row.status.name,
            statusCategory: row.status.category,
            priority: row.priority,
            assignees: row.assignees.map((a) => ({ name: a.user.name, email: a.user.email })),
            labels: row.labels.map((l) => l.label.name),
            points: row.points,
            estimateHours: row.estimateHours,
            percentDone: row.percentDone,
            startDate: dateOnly(row.startDate),
            dueDate: dateOnly(row.dueDate),
            parentKey: row.parent ? formatItemKey(row.parent.keyPrefix, row.parent.number) : null,
            description: row.descriptionText,
          };
        }),
        links: links.map((l) => ({
          source: keyOf.get(l.fromId)!,
          type: l.type,
          target: keyOf.get(l.toId)!,
        })),
      },
    };
  }
}

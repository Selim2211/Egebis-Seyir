import { Injectable } from '@nestjs/common';
import { epicProgress, epicStats, type EpicsResponse } from '@scrum/shared';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { notFound } from '../spaces/space-errors';
import { summaryInclude, toSummary } from './item-support';

/** Space'in Epic'leri ve ilerlemeleri (Faz 3.1, ADR-068). */
@Injectable()
export class EpicsService {
  constructor(private readonly tenant: TenantPrismaService) {}

  async list(spaceId: string): Promise<EpicsResponse> {
    const db = this.tenant.db;
    const space = await db.space.findFirst({
      where: { id: spaceId, deletedAt: null },
      select: { id: true },
    });
    if (!space) throw notFound();

    const epics = await db.workItem.findMany({
      where: { spaceId, type: 'EPIC', deletedAt: null, archivedAt: null },
      include: summaryInclude,
      orderBy: { createdAt: 'asc' },
    });
    const children = await db.workItem.findMany({
      where: {
        parentId: { in: epics.map((e) => e.id) },
        deletedAt: null,
        archivedAt: null,
      },
      select: { parentId: true, points: true, status: { select: { category: true } } },
    });

    return {
      epics: epics.map((epic) => {
        const own = children
          .filter((c) => c.parentId === epic.id)
          .map((c) => ({ points: c.points, category: c.status.category }));
        return {
          ...toSummary(epic),
          goal: epic.goal,
          color: epic.color,
          progress: epicProgress(own),
          stats: epicStats(own),
        };
      }),
    };
  }
}

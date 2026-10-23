import { Injectable } from '@nestjs/common';
import {
  formatItemKey,
  type MapLayoutRequest,
  MapPositionsSchema,
  type ProjectMap,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { notFound } from '../spaces/space-errors';
import { asJson } from './item-support';

/** Proje Kuş Bakışı (ADR-136): Space'in tüm işleri ve kullanıcının kaydettiği kutu konumları. */
@Injectable()
export class ProjectMapService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  private async assertSpace(spaceId: string): Promise<void> {
    const space = await this.tenant.db.space.findFirst({
      where: { id: spaceId, deletedAt: null },
      select: { id: true },
    });
    if (!space) throw notFound();
  }

  async get(spaceId: string): Promise<ProjectMap> {
    await this.assertSpace(spaceId);
    const db = this.tenant.db;
    const [rows, stored] = await Promise.all([
      db.workItem.findMany({
        where: { spaceId, deletedAt: null, archivedAt: null },
        select: {
          id: true,
          keyPrefix: true,
          number: true,
          type: true,
          title: true,
          parentId: true,
          color: true,
          status: { select: { name: true, color: true, category: true } },
          assignees: {
            select: { user: { select: { id: true, name: true, avatarVersion: true } } },
            orderBy: { createdAt: 'asc' },
          },
          sprint: { select: { id: true, name: true } },
        },
        orderBy: [{ number: 'asc' }],
      }),
      db.mapLayout.findUnique({
        where: { userId_spaceId: { userId: this.ctx.actorId, spaceId } },
        select: { positions: true },
      }),
    ]);
    const known = new Set(rows.map((r) => r.id));
    const parsed = MapPositionsSchema.safeParse(stored?.positions ?? {});
    // Silinen/arşivlenen işlerin konumları düşer.
    const positions = Object.fromEntries(
      Object.entries(parsed.success ? parsed.data : {}).filter(([id]) => known.has(id)),
    );
    return {
      nodes: rows.map((r) => ({
        id: r.id,
        key: formatItemKey(r.keyPrefix, r.number),
        type: r.type,
        title: r.title,
        parentId: r.parentId,
        color: r.color,
        status: r.status,
        assignees: r.assignees.map((a) => a.user),
        sprint: r.sprint,
      })),
      positions,
    };
  }

  /** Konumları kaydeder; boş nesne kaydı siler (otomatik düzene dönülür). */
  async saveLayout(spaceId: string, input: MapLayoutRequest): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    await this.assertSpace(spaceId);
    const where = { userId_spaceId: { userId: actorId, spaceId } };
    if (Object.keys(input.positions).length === 0) {
      await this.tenant.db.mapLayout.deleteMany({ where: { userId: actorId, spaceId } });
      return;
    }
    await this.tenant.db.mapLayout.upsert({
      where,
      create: { workspaceId, userId: actorId, spaceId, positions: asJson(input.positions) },
      update: { positions: asJson(input.positions) },
    });
  }
}

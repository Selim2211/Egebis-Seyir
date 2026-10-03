import { Injectable } from '@nestjs/common';
import { normalizeDashboard, type Dashboard } from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { notFound } from '../spaces/space-errors';
import { asJson } from '../work-items/item-support';

/** Kullanıcıya özel pano düzeni (Faz 4.6, ADR-078): widget sırası, boyutu ve görünürlüğü. */
@Injectable()
export class DashboardService {
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

  async get(spaceId: string): Promise<Dashboard> {
    await this.assertSpace(spaceId);
    const stored = await this.tenant.db.dashboardLayout.findUnique({
      where: { userId_spaceId: { userId: this.ctx.actorId, spaceId } },
    });
    return { widgets: normalizeDashboard(stored?.widgets) };
  }

  /** Düzeni kaydeder; bilinmeyen/tekrarlı widget'lar ve eksikler normalleştirilir. */
  async set(spaceId: string, input: Dashboard): Promise<Dashboard> {
    const { workspaceId, actorId } = this.ctx;
    await this.assertSpace(spaceId);
    const widgets = normalizeDashboard(input.widgets);
    await this.tenant.db.dashboardLayout.upsert({
      where: { userId_spaceId: { userId: actorId, spaceId } },
      create: { workspaceId, userId: actorId, spaceId, widgets: asJson(widgets) },
      update: { widgets: asJson(widgets) },
    });
    return { widgets };
  }
}

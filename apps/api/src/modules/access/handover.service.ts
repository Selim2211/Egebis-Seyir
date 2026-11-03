import { ForbiddenException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ERROR_CODES, type HandoverPlan, type HandoverProject } from '@scrum/shared';
import { RoleScope } from '../../generated/prisma/client';
import { type TenantClient, TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { roleTier } from './role-tier';

type Tx = Pick<
  TenantClient,
  'workItem' | 'workItemAssignee' | 'space' | 'spaceMember' | 'membership'
>;

/**
 * Çıkarılan üyenin açık işlerinin devri (ADR-153). Açık iş = silinmemiş, durumu "bitti"
 * kategorisinde olmayan ve kişinin atandığı öğe. Biten işlerin ataması geçmiş için korunur.
 */
@Injectable()
export class HandoverService {
  constructor(private readonly tenant: TenantPrismaService) {}

  /** Kişinin açık işi olan (ya da yöneticisi olduğu) Projeler için devir planı. */
  async plan(userId: string, onlySpaceId?: string, db?: Tx): Promise<HandoverPlan> {
    db ??= this.tenant.db;
    const [open, managed] = await Promise.all([
      db.workItem.groupBy({
        by: ['spaceId'],
        where: {
          deletedAt: null,
          status: { category: { not: 'DONE' } },
          assignees: { some: { userId } },
          space: { deletedAt: null },
          ...(onlySpaceId ? { spaceId: onlySpaceId } : {}),
        },
        _count: { _all: true },
      }),
      db.spaceMember.findMany({
        where: {
          userId,
          role: { scope: RoleScope.SPACE, permissions: { has: 'space.settings' } },
          space: { deletedAt: null },
          ...(onlySpaceId ? { spaceId: onlySpaceId } : {}),
        },
        select: { spaceId: true },
      }),
    ]);
    const counts = new Map(open.map((g) => [g.spaceId, g._count._all]));
    const managerOf = new Set(managed.map((m) => m.spaceId));
    const spaceIds = [...new Set([...counts.keys(), ...managerOf])];
    if (spaceIds.length === 0) return { projects: [] };

    const spaces = await db.space.findMany({
      where: { id: { in: spaceIds } },
      select: {
        id: true,
        name: true,
        key: true,
        members: {
          where: { userId: { not: userId } },
          orderBy: { createdAt: 'asc' },
          select: {
            userId: true,
            user: { select: { name: true } },
            role: { select: { permissions: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    // Katman bu workspace'teki üyelikten okunur (tenant istemcisi workspace'e süzer).
    const tiers = new Map(
      (
        await db.membership.findMany({
          where: {
            userId: { in: [...new Set(spaces.flatMap((s) => s.members.map((m) => m.userId)))] },
          },
          select: { userId: true, role: { select: { key: true, baseKey: true } } },
        })
      ).map((m) => [m.userId, roleTier(m.role)]),
    );

    const projects: HandoverProject[] = spaces.map((space) => {
      const candidates = space.members
        // Dış kaynak devralamaz: ekip dışı biri proje işlerinin sahibi olmasın.
        .filter((m) => tiers.has(m.userId) && tiers.get(m.userId) !== 'GUEST')
        .map((m) => ({
          userId: m.userId,
          name: m.user.name,
          isManager: m.role.permissions.includes('space.settings'),
        }));
      const isManager = managerOf.has(space.id);
      const manager = candidates.find((c) => c.isManager) ?? null;
      return {
        spaceId: space.id,
        name: space.name,
        key: space.key,
        openItems: counts.get(space.id) ?? 0,
        isManager,
        defaultAssigneeId: isManager ? null : (manager?.userId ?? null),
        needsChoice: (counts.get(space.id) ?? 0) > 0 && (isManager || manager === null),
        candidates,
      };
    });
    return { projects };
  }

  /**
   * Devri uygular: her Projede açık işlerin ataması alıcıya geçer (alıcı zaten atanmışsa yalnızca
   * çıkarılan silinir). `reassign` verilmeyen Projelerde varsayılan yönetici kullanılır; alıcı
   * gerekip seçilmemişse HANDOVER_TARGET_REQUIRED.
   */
  async apply(
    tx: Tx,
    userId: string,
    reassign: Record<string, string>,
    onlySpaceId?: string,
  ): Promise<{ spaceId: string; to: string; items: number }[]> {
    const { projects } = await this.plan(userId, onlySpaceId, tx);
    const done: { spaceId: string; to: string; items: number }[] = [];
    for (const project of projects) {
      if (project.openItems === 0) continue;
      const chosen = reassign[project.spaceId];
      const to = chosen ?? project.defaultAssigneeId;
      if (!to) {
        throw new UnprocessableEntityException({ code: ERROR_CODES.HANDOVER_TARGET_REQUIRED });
      }
      if (!project.candidates.some((c) => c.userId === to)) {
        throw new ForbiddenException({ code: ERROR_CODES.HANDOVER_TARGET_REQUIRED });
      }
      const items = await tx.workItem.findMany({
        where: {
          spaceId: project.spaceId,
          deletedAt: null,
          status: { category: { not: 'DONE' } },
          assignees: { some: { userId } },
        },
        select: { id: true, workspaceId: true },
      });
      const ids = items.map((i) => i.id);
      await tx.workItemAssignee.deleteMany({ where: { workItemId: { in: ids }, userId } });
      await tx.workItemAssignee.createMany({
        data: items.map((i) => ({ workspaceId: i.workspaceId, workItemId: i.id, userId: to })),
        skipDuplicates: true,
      });
      done.push({ spaceId: project.spaceId, to, items: ids.length });
    }
    return done;
  }
}

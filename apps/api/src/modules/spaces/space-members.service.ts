import { Injectable, NotFoundException } from '@nestjs/common';
import {
  checkSpaceRole,
  ERROR_CODES,
  SPACE_PERMISSIONS as S,
  type SpaceMember,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import { RoleScope } from '../../generated/prisma/client';
import type { AppClsStore } from '../../infra/cls/request-context';
import { HandoverService } from '../access/handover.service';
import { roleTier } from '../access/role-tier';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { ActivityService } from '../activity/activity.service';
import { forbidden, notFound } from './space-errors';

/** Space üyeleri ve Scrum rolleri (brief §7.2). */
@Injectable()
export class SpaceMembersService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly activity: ActivityService,
    private readonly handover: HandoverService,
  ) {}

  async list(spaceId: string): Promise<SpaceMember[]> {
    const db = this.tenant.db;
    await this.ensureSpace(spaceId);
    const members = await db.spaceMember.findMany({
      where: { spaceId },
      include: {
        role: { select: { key: true } },
        user: { select: { id: true, name: true, title: true, avatarVersion: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const memberships = await db.membership.findMany({
      where: { userId: { in: members.map((m) => m.userId) } },
      select: { userId: true, role: { select: { key: true, baseKey: true } } },
    });
    const workspaceRoles = new Map(memberships.map((m) => [m.userId, roleTier(m.role)]));
    return members.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      title: m.user.title,
      avatarVersion: m.user.avatarVersion,
      role: m.role.key,
      workspaceRole: workspaceRoles.get(m.userId) ?? 'GUEST',
    }));
  }

  /** Üye ekler veya Scrum rolünü değiştirir. */
  async put(spaceId: string, userId: string, role: string): Promise<void> {
    const workspaceId = this.cls.get('workspaceId')!;
    const db = this.tenant.db;
    await this.ensureSpace(spaceId);

    const membership = await db.membership.findFirst({
      where: { userId },
      select: { role: { select: { key: true, baseKey: true } } },
    });
    if (!membership) throw notFound();
    const check = checkSpaceRole(roleTier(membership.role), role);
    if (!check.ok) throw forbidden(check.code);

    const spaceRole = await db.role.findFirst({
      where: { scope: RoleScope.SPACE, key: role },
      select: { id: true },
    });
    if (!spaceRole) throw new NotFoundException({ code: ERROR_CODES.ROLE_NOT_FOUND });
    await db.$transaction(async (tx) => {
      const existing = await tx.spaceMember.findFirst({
        where: { spaceId, userId },
        include: { role: { select: { key: true } } },
      });
      if (existing?.role.key === role) return;
      if (existing) {
        await tx.spaceMember.update({ where: { id: existing.id }, data: { roleId: spaceRole.id } });
      } else {
        await tx.spaceMember.create({
          data: { workspaceId, spaceId, userId, roleId: spaceRole.id },
        });
      }
      await this.activity.record(tx, {
        workspaceId,
        actorId: this.cls.get('userId')!,
        entityType: 'space',
        entityId: spaceId,
        action: existing ? 'space.member_role_changed' : 'space.member_added',
        changes: { userId, role: { from: existing?.role.key ?? null, to: role } },
      });
    });
  }

  /**
   * Projeden çıkarır; açık işleri devredilir (ADR-153): `reassign[spaceId]`, yoksa Projenin ilk
   * yöneticisi, o da yoksa çıkaran kişi (üyeyse) ya da Projenin ilk üyesi. Proje Yöneticisini
   * yalnızca Super Admin çıkarabilir.
   */
  async remove(
    spaceId: string,
    userId: string,
    reassign: Record<string, string> = {},
  ): Promise<void> {
    const workspaceId = this.cls.get('workspaceId')!;
    const actorId = this.cls.get('userId')!;
    const tier = this.cls.get('workspaceRole');
    await this.ensureSpace(spaceId);
    await this.tenant.db.$transaction(async (tx) => {
      const existing = await tx.spaceMember.findFirst({
        where: { spaceId, userId },
        include: { role: { select: { key: true, permissions: true } } },
      });
      if (!existing) throw notFound();
      if (
        existing.role.permissions.includes(S.SPACE_SETTINGS) &&
        tier !== 'OWNER' &&
        tier !== 'ADMIN'
      ) {
        throw forbidden(ERROR_CODES.MANAGER_REMOVAL_SUPER_ADMIN);
      }
      const plan = await this.handover.plan(userId, spaceId, tx);
      const project = plan.projects[0];
      const target =
        reassign[spaceId] ??
        project?.defaultAssigneeId ??
        (project?.candidates.some((c) => c.userId === actorId)
          ? actorId
          : project?.candidates[0]?.userId);
      const handedOver = await this.handover.apply(
        tx,
        userId,
        target ? { [spaceId]: target } : {},
        spaceId,
      );
      await tx.spaceMember.delete({ where: { id: existing.id } });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'space',
        entityId: spaceId,
        action: 'space.member_removed',
        changes: {
          userId,
          role: { from: existing.role.key, to: null },
          ...(handedOver.length > 0 ? { handover: handedOver } : {}),
        },
      });
    });
  }

  private async ensureSpace(spaceId: string): Promise<void> {
    const space = await this.tenant.db.space.findFirst({
      where: { id: spaceId, deletedAt: null },
      select: { id: true },
    });
    if (!space) throw notFound();
  }
}

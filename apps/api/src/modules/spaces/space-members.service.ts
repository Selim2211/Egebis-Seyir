import { Injectable, NotFoundException } from '@nestjs/common';
import {
  checkSpaceRole,
  DEFAULT_SPACE_ROLE_PERMISSIONS,
  ERROR_CODES,
  PROJECT_CONFIGURABLE_PERMISSIONS,
  SPACE_PERMISSIONS as S,
  SPACE_ROLES,
  type ProjectRoleOverrides,
  type ProjectRolesResponse,
  type PutProjectRoleRequest,
  type SpaceMember,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import { Prisma, RoleScope } from '../../generated/prisma/client';

const DbNull = Prisma.DbNull;
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

  /** Projenin rol ayarı (ADR-161): ayarlanabilir izinlerin etkin hali ve Workspace varsayılanı. */
  async roleSettings(spaceId: string): Promise<ProjectRolesResponse> {
    const db = this.tenant.db;
    const space = await db.space.findFirst({
      where: { id: spaceId, deletedAt: null },
      select: { roleOverrides: true },
    });
    if (!space) throw notFound();
    const roles = await db.role.findMany({
      where: { scope: RoleScope.SPACE, key: { in: [...SPACE_ROLES] } },
      select: { key: true, permissions: true },
    });
    const overrides = (space.roleOverrides ?? {}) as ProjectRoleOverrides;
    const configurable = PROJECT_CONFIGURABLE_PERMISSIONS as readonly string[];
    const superAdmin = this.isSuperAdmin();
    return {
      configurable: [...configurable],
      roles: SPACE_ROLES.map((role) => {
        const base = roles.find((r) => r.key === role)?.permissions ?? [
          ...DEFAULT_SPACE_ROLE_PERMISSIONS[role],
        ];
        const defaults = base.filter((p) => configurable.includes(p));
        const custom = overrides[role];
        return {
          role,
          permissions: custom ? custom.filter((p) => configurable.includes(p)) : defaults,
          defaults,
          customized: Boolean(custom),
          editable: role === 'PROJECT_MEMBER' || superAdmin,
        };
      }),
    };
  }

  /** Bir rolün Proje ayarını değiştirir; Proje Yöneticisi rolünü yalnızca Super Admin ayarlar. */
  async putRoleSetting(spaceId: string, input: PutProjectRoleRequest): Promise<void> {
    if (input.role === 'PROJECT_MANAGER' && !this.isSuperAdmin()) {
      throw forbidden(ERROR_CODES.FORBIDDEN);
    }
    const workspaceId = this.cls.get('workspaceId')!;
    const actorId = this.cls.get('userId')!;
    await this.tenant.db.$transaction(async (tx) => {
      const space = await tx.space.findFirst({
        where: { id: spaceId, deletedAt: null },
        select: { roleOverrides: true },
      });
      if (!space) throw notFound();
      const overrides = { ...((space.roleOverrides ?? {}) as ProjectRoleOverrides) };
      const before = overrides[input.role] ?? null;
      if (input.permissions === null) delete overrides[input.role];
      else overrides[input.role] = [...new Set(input.permissions)];
      await tx.space.update({
        where: { id: spaceId },
        data: { roleOverrides: Object.keys(overrides).length > 0 ? overrides : DbNull },
      });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'space',
        entityId: spaceId,
        action: 'space.role_permissions_changed',
        changes: { role: input.role, permissions: { from: before, to: input.permissions } },
      });
    });
  }

  private isSuperAdmin(): boolean {
    const tier = this.cls.get('workspaceRole');
    return tier === 'OWNER' || tier === 'ADMIN';
  }

  private async ensureSpace(spaceId: string): Promise<void> {
    const space = await this.tenant.db.space.findFirst({
      where: { id: spaceId, deletedAt: null },
      select: { id: true },
    });
    if (!space) throw notFound();
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import {
  checkSpaceRole,
  DEFAULT_OUTSOURCE_ACCESS,
  DEFAULT_SPACE_ROLE_PERMISSIONS,
  ERROR_CODES,
  PROJECT_CONFIGURABLE_PERMISSIONS,
  SPACE_PERMISSIONS as S,
  SPACE_ROLES,
  normalizeOutsourceAccess,
  type OutsourceAccessResponse,
  type ProjectRoleOverrides,
  type ProjectRolesResponse,
  type PutBugSendersRequest,
  type PutOutsourceAccessRequest,
  type PutProjectRoleRequest,
  type PutScrumRolesRequest,
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
import { isMembershipLocked } from '../access/account-term';
import { forbidden, notFound } from './space-errors';
import type { TenantClient } from '../../infra/prisma/tenant-prisma.service';

/** Rol eşitlemesinin transaction içinde kullandığı tablolar. */
type MembersTx = Pick<TenantClient, 'space' | 'spaceMember' | 'role' | 'activityEvent'>;

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

  /** Guest (VIEWER) ve Dış kaynak (GUEST) Projeye yalnızca Super Admin ekler/çıkarır (ADR-169, ADR-172). */
  private assertViewerAdminOnly(targetTier: string): void {
    const actor = this.cls.get('workspaceRole');
    if (
      (targetTier === 'VIEWER' || targetTier === 'GUEST') &&
      actor !== 'OWNER' &&
      actor !== 'ADMIN'
    ) {
      throw forbidden(ERROR_CODES.VIEWER_ADMIN_ONLY);
    }
  }

  /**
   * Dış kaynak yetkisini yalnızca Super Admin, Projenin Scrum Master'ı ya da Proje yöneticisi
   * (`space.settings`) ayarlar (ADR-172).
   */
  private assertOutsourceManager(space: { scrumMasterId: string | null }): void {
    const tier = this.cls.get('workspaceRole');
    if (tier === 'OWNER' || tier === 'ADMIN') return;
    if (space.scrumMasterId === this.cls.get('userId')) return;
    if (this.cls.get('spacePermissions')?.includes(S.SPACE_SETTINGS)) return;
    throw forbidden(ERROR_CODES.OUTSOURCE_ACCESS_FORBIDDEN);
  }

  /** Projeye atanmış dış kaynaklar ve bu Projedeki kişisel yetkileri. */
  async outsourceAccess(spaceId: string): Promise<OutsourceAccessResponse> {
    const db = this.tenant.db;
    const space = await db.space.findFirst({
      where: { id: spaceId, deletedAt: null },
      select: { scrumMasterId: true },
    });
    if (!space) throw notFound();
    this.assertOutsourceManager(space);
    const rows = await db.spaceMember.findMany({
      where: {
        spaceId,
        user: { memberships: { some: { role: { scope: RoleScope.WORKSPACE, key: 'GUEST' } } } },
      },
      select: {
        outsourceAccess: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarVersion: true,
            memberships: { select: { lockedAt: true, expiresAt: true } },
          },
        },
      },
      orderBy: { user: { name: 'asc' } },
    });
    return {
      people: rows.map((r) => {
        const m = r.user.memberships[0] ?? { lockedAt: null, expiresAt: null };
        return {
          userId: r.user.id,
          name: r.user.name,
          email: r.user.email,
          avatarVersion: r.user.avatarVersion,
          expiresAt: m.expiresAt?.toISOString() ?? null,
          locked: isMembershipLocked(m),
          access: normalizeOutsourceAccess(r.outsourceAccess),
        };
      }),
    };
  }

  /** Dış kaynağın bu Projedeki alan yetkisini ayarlar. */
  async putOutsourceAccess(
    spaceId: string,
    userId: string,
    input: PutOutsourceAccessRequest,
  ): Promise<void> {
    const workspaceId = this.cls.get('workspaceId')!;
    const db = this.tenant.db;
    const space = await db.space.findFirst({
      where: { id: spaceId, deletedAt: null },
      select: { scrumMasterId: true },
    });
    if (!space) throw notFound();
    this.assertOutsourceManager(space);
    const target = await db.spaceMember.findFirst({
      where: { spaceId, userId },
      include: {
        user: {
          select: { memberships: { select: { role: { select: { key: true, baseKey: true } } } } },
        },
      },
    });
    if (!target) throw notFound();
    const tier = target.user.memberships[0] ? roleTier(target.user.memberships[0].role) : null;
    if (tier !== 'GUEST') throw forbidden(ERROR_CODES.NOT_OUTSOURCE);
    const access = normalizeOutsourceAccess(input.access);
    await db.$transaction(async (tx) => {
      await tx.spaceMember.update({
        where: { id: target.id },
        data: { outsourceAccess: access as Prisma.InputJsonValue },
      });
      await this.activity.record(tx, {
        workspaceId,
        actorId: this.cls.get('userId')!,
        entityType: 'space',
        entityId: spaceId,
        action: 'space.outsource_access_changed',
        changes: {
          userId,
          from: normalizeOutsourceAccess(target.outsourceAccess),
          to: access,
        },
      });
    });
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
    const targetTier = roleTier(membership.role);
    const check = checkSpaceRole(targetTier, role);
    if (!check.ok) throw forbidden(check.code);
    this.assertViewerAdminOnly(targetTier);

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
      if (existing?.role.key !== role) {
        if (existing) {
          await tx.spaceMember.update({
            where: { id: existing.id },
            data: { roleId: spaceRole.id },
          });
        } else {
          await tx.spaceMember.create({
            data: {
              workspaceId,
              spaceId,
              userId,
              roleId: spaceRole.id,
              ...(targetTier === 'GUEST'
                ? { outsourceAccess: DEFAULT_OUTSOURCE_ACCESS as Prisma.InputJsonValue }
                : {}),
            },
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
      }
      await this.syncScrumRoles(tx, spaceId, userId, role);
    });
  }

  /**
   * Tek Scrum Master / tek Product Owner kuralı (ADR-176): rolü alan kişi Projenin scrumMasterId /
   * productOwnerId alanına yazılır, önceki sahibi Team Member olur; rolü bırakan kişinin alanı boşalır.
   */
  private async syncScrumRoles(
    tx: MembersTx,
    spaceId: string,
    userId: string,
    role: string,
  ): Promise<void> {
    const space = await tx.space.findFirstOrThrow({
      where: { id: spaceId },
      select: { scrumMasterId: true, productOwnerId: true },
    });
    const slots = [
      { role: 'PROJECT_MANAGER', field: 'scrumMasterId', holder: space.scrumMasterId },
      { role: 'PRODUCT_OWNER', field: 'productOwnerId', holder: space.productOwnerId },
    ] as const;
    const data: { scrumMasterId?: string | null; productOwnerId?: string | null } = {};
    for (const slot of slots) {
      if (slot.role === role) {
        if (slot.holder === userId) continue;
        if (slot.holder) await this.demoteToTeamMember(tx, spaceId, slot.holder, slot.role);
        data[slot.field] = userId;
      } else if (slot.holder === userId) {
        data[slot.field] = null;
      }
    }
    if (Object.keys(data).length > 0) await tx.space.update({ where: { id: spaceId }, data });
  }

  private async demoteToTeamMember(
    tx: MembersTx,
    spaceId: string,
    userId: string,
    fromRole: string,
  ): Promise<void> {
    const member = await tx.spaceMember.findFirst({
      where: { spaceId, userId, role: { key: fromRole } },
      select: { id: true },
    });
    if (!member) return;
    const teamMember = await tx.role.findFirst({
      where: { scope: RoleScope.SPACE, key: 'PROJECT_MEMBER' },
      select: { id: true },
    });
    if (!teamMember) throw new NotFoundException({ code: ERROR_CODES.ROLE_NOT_FOUND });
    await tx.spaceMember.update({ where: { id: member.id }, data: { roleId: teamMember.id } });
    await this.activity.record(tx, {
      workspaceId: this.cls.get('workspaceId'),
      actorId: this.cls.get('userId')!,
      entityType: 'space',
      entityId: spaceId,
      action: 'space.member_role_changed',
      changes: { userId, role: { from: fromRole, to: 'PROJECT_MEMBER' } },
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
    const targetMembership = await this.tenant.db.membership.findFirst({
      where: { userId },
      select: { role: { select: { key: true, baseKey: true } } },
    });
    if (targetMembership) this.assertViewerAdminOnly(roleTier(targetMembership.role));
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
      // Çıkan kişi Projenin Product Owner/Scrum Master'ıysa o görev boşalır.
      await tx.space.updateMany({
        where: { id: spaceId, productOwnerId: userId },
        data: { productOwnerId: null },
      });
      await tx.space.updateMany({
        where: { id: spaceId, scrumMasterId: userId },
        data: { scrumMasterId: null },
      });
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

  /**
   * Eski Scrum rolleri ucu (ADR-167): artık üyenin rolünü değiştirir (ADR-176). Kişi Projenin
   * üyesi olmalı; boş bırakılan görevin sahibi Team Member olur.
   */
  async putScrumRoles(spaceId: string, input: PutScrumRolesRequest): Promise<void> {
    const space = await this.tenant.db.space.findFirst({
      where: { id: spaceId, deletedAt: null },
      select: { productOwnerId: true, scrumMasterId: true },
    });
    if (!space) throw notFound();
    for (const userId of [input.productOwnerId, input.scrumMasterId]) {
      if (userId && !(await this.tenant.db.spaceMember.findFirst({ where: { spaceId, userId } }))) {
        throw forbidden(ERROR_CODES.SCRUM_ROLE_NOT_MEMBER);
      }
    }
    const changes: Array<[string | null, string | null, string]> = [
      [space.scrumMasterId, input.scrumMasterId, 'PROJECT_MANAGER'],
      [space.productOwnerId, input.productOwnerId, 'PRODUCT_OWNER'],
    ];
    for (const [from, to, role] of changes) {
      if (from === to) continue;
      if (to) await this.put(spaceId, to, role);
      else if (from) await this.put(spaceId, from, 'PROJECT_MEMBER');
    }
  }

  /** Bu Projeye Bug gönderebilecek gelen e-posta kalıpları (isim kısmında * ve ?). */
  async putBugSenders(spaceId: string, input: PutBugSendersRequest): Promise<void> {
    const workspaceId = this.cls.get('workspaceId')!;
    const actorId = this.cls.get('userId')!;
    await this.tenant.db.$transaction(async (tx) => {
      const space = await tx.space.findFirst({
        where: { id: spaceId, deletedAt: null },
        select: { bugSenders: true },
      });
      if (!space) throw notFound();
      await tx.space.update({ where: { id: spaceId }, data: { bugSenders: input.senders } });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'space',
        entityId: spaceId,
        action: 'space.bug_senders_changed',
        changes: { bugSenders: { from: space.bugSenders, to: input.senders } },
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

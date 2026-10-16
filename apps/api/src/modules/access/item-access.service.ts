import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  checkSpaceRole,
  DEFAULT_SPACE_ROLE_PERMISSIONS,
  ERROR_CODES,
  type ItemAccess,
  itemPermissions,
  type PutItemAccessRequest,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import { RoleScope } from '../../generated/prisma/client';
import type { AppClsStore } from '../../infra/cls/request-context';
import { resetHiddenRoots } from '../../infra/prisma/item-visibility';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { ActivityService } from '../activity/activity.service';
import { roleTier } from './role-tier';

const notFound = () => new NotFoundException({ code: ERROR_CODES.NOT_FOUND });

/** Öğe bazlı erişim (ADR-113): etkin izinleri hesaplar, özel erişim listesini yönetir. */
@Injectable()
export class ItemAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly activity: ActivityService,
  ) {}

  /**
   * Öğedeki etkin izinler. `spacePerms`: kullanıcının Space'teki izinleri (görünmezse null).
   * Dönen null = öğe görünmez.
   */
  async permissionsForItem(
    itemId: string,
    spacePerms: readonly string[] | null,
  ): Promise<readonly string[] | null> {
    const userId = this.cls.get('userId');
    const workspaceId = this.cls.get('workspaceId');
    const tier = this.cls.get('workspaceRole');
    if (!userId || !workspaceId || !tier) return spacePerms;

    const item = await this.prisma.workItem.findFirst({
      where: { id: itemId, workspaceId },
      select: { accessRootId: true },
    });
    if (!item?.accessRootId) return spacePerms;
    const root = await this.prisma.workItemAccess.findUnique({
      where: { itemId: item.accessRootId },
      select: {
        isPrivate: true,
        createdById: true,
        entries: {
          select: { userId: true, teamId: true, role: { select: { permissions: true } } },
        },
      },
    });
    if (!root) return spacePerms;

    const teams = new Set(
      (
        await this.prisma.teamMember.findMany({
          where: { userId, workspaceId },
          select: { teamId: true },
        })
      ).map((t) => t.teamId),
    );
    const mine = root.entries.filter(
      (e) => e.userId === userId || (e.teamId !== null && teams.has(e.teamId)),
    );
    const stakeholder = DEFAULT_SPACE_ROLE_PERMISSIONS.STAKEHOLDER;
    return itemPermissions({
      workspaceRole: tier,
      spacePermissions: spacePerms,
      root: { isPrivate: root.isPrivate, createdById: root.createdById },
      entryPermissions:
        mine.length === 0 ? null : [...new Set(mine.flatMap((e) => e.role.permissions))],
      userId,
      guestCap: stakeholder,
    });
  }

  /** GET: öğenin etkin erişim ayarı ve (varsa) listesi. */
  async get(itemId: string): Promise<ItemAccess> {
    const db = this.tenant.db;
    const item = await db.workItem.findFirst({
      where: { id: itemId },
      select: { id: true, accessRootId: true },
    });
    if (!item) throw notFound();
    if (!item.accessRootId) return { own: false, root: null, isPrivate: false, entries: [] };

    const root = await db.workItem.findFirst({
      where: { id: item.accessRootId },
      select: {
        id: true,
        title: true,
        keyPrefix: true,
        number: true,
        access: {
          select: {
            isPrivate: true,
            entries: {
              orderBy: { createdAt: 'asc' },
              select: {
                userId: true,
                teamId: true,
                team: { select: { name: true } },
                role: { select: { key: true } },
              },
            },
          },
        },
      },
    });
    if (!root?.access) return { own: false, root: null, isPrivate: false, entries: [] };

    const userIds = root.access.entries.flatMap((e) => (e.userId ? [e.userId] : []));
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const names = new Map(users.map((u) => [u.id, u.name]));
    return {
      own: root.id === itemId,
      root: { id: root.id, key: `${root.keyPrefix}-${root.number}`, title: root.title },
      isPrivate: root.access.isPrivate,
      entries: root.access.entries.map((e) => ({
        userId: e.userId,
        teamId: e.teamId,
        name: e.userId ? (names.get(e.userId) ?? '?') : (e.team?.name ?? '?'),
        roleKey: e.role.key,
      })),
    };
  }

  /** PUT: öğeye özel erişim kurar veya günceller (kişi/takım + rol, isteğe bağlı gizli). */
  async put(itemId: string, input: PutItemAccessRequest): Promise<void> {
    const workspaceId = this.cls.get('workspaceId')!;
    const actorId = this.cls.get('userId')!;
    const tier = this.cls.get('workspaceRole')!;
    const actorPerms = this.cls.get('spacePermissions') ?? [];
    const db = this.tenant.db;
    const item = await db.workItem.findFirst({
      where: { id: itemId },
      select: { id: true, spaceId: true },
    });
    if (!item) throw notFound();
    const invalid = () => new ForbiddenException({ code: ERROR_CODES.ITEM_ACCESS_INVALID });

    const entries = [...input.entries];
    const keys = entries.map((e) => e.userId ?? `t:${e.teamId}`);
    if (new Set(keys).size !== keys.length) throw invalid();

    // Kişiler workspace üyesi, takımlar workspace'te olmalı; roller Space kapsamlı.
    const userIds = entries.flatMap((e) => (e.userId ? [e.userId] : []));
    const teamIds = entries.flatMap((e) => (e.teamId ? [e.teamId] : []));
    const [memberships, teams, roles] = await Promise.all([
      db.membership.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, role: { select: { key: true, baseKey: true } } },
      }),
      db.team.count({ where: { id: { in: teamIds } } }),
      db.role.findMany({
        where: { scope: RoleScope.SPACE, key: { in: [...new Set(entries.map((e) => e.roleKey))] } },
        select: { id: true, key: true, permissions: true },
      }),
    ]);
    if (memberships.length !== new Set(userIds).size || teams !== new Set(teamIds).size) {
      throw invalid();
    }
    const roleByKey = new Map(roles.map((r) => [r.key, r]));
    const memberTier = new Map(memberships.map((m) => [m.userId, roleTier(m.role)]));
    for (const entry of entries) {
      const role = roleByKey.get(entry.roleKey);
      if (!role) throw new NotFoundException({ code: ERROR_CODES.ROLE_NOT_FOUND });
      if (entry.userId) {
        const check = checkSpaceRole(memberTier.get(entry.userId)!, entry.roleKey);
        if (!check.ok) throw new ForbiddenException({ code: check.code });
      }
      // Yükseltme yok: kimse kendi sahip olmadığı yetkiyi veremez (Owner/Admin hariç).
      if (
        tier !== 'OWNER' &&
        tier !== 'ADMIN' &&
        role.permissions.some((p) => !actorPerms.includes(p))
      ) {
        throw new ForbiddenException({ code: ERROR_CODES.ITEM_ACCESS_ESCALATION });
      }
    }

    // Gizli yapan kişi kendini dışarıda bırakmasın: listede yoksa Space rolüyle eklenir.
    const privateByMember = input.isPrivate && tier !== 'OWNER' && tier !== 'ADMIN';
    let selfRoleId: string | null = null;
    if (privateByMember && !userIds.includes(actorId)) {
      const own = await db.spaceMember.findFirst({
        where: { spaceId: item.spaceId, userId: actorId },
        select: { roleId: true },
      });
      const fallback = await db.role.findFirstOrThrow({
        where: { scope: RoleScope.SPACE, key: 'STAKEHOLDER' },
        select: { id: true },
      });
      selfRoleId = own?.roleId ?? fallback.id;
    }

    await db.$transaction(async (tx) => {
      const existing = await tx.workItemAccess.findUnique({ where: { itemId } });
      if (existing) {
        await tx.workItemAccess.update({ where: { itemId }, data: { isPrivate: input.isPrivate } });
        await tx.workItemAccessEntry.deleteMany({ where: { itemId } });
      } else {
        await tx.workItemAccess.create({
          data: { itemId, workspaceId, isPrivate: input.isPrivate, createdById: actorId },
        });
      }
      const rows = entries.map((e) => ({
        workspaceId,
        itemId,
        userId: e.userId ?? null,
        teamId: e.teamId ?? null,
        roleId: roleByKey.get(e.roleKey)!.id,
      }));
      if (selfRoleId && input.isPrivate) {
        rows.push({ workspaceId, itemId, userId: actorId, teamId: null, roleId: selfRoleId });
      }
      if (rows.length > 0) await tx.workItemAccessEntry.createMany({ data: rows });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'item',
        entityId: itemId,
        action: 'item.access_changed',
        changes: { isPrivate: input.isPrivate, entries: rows.length },
      });
    });
    resetHiddenRoots(this.cls);
  }

  /** DELETE: özel erişimi kaldırır; öğe tekrar üstünün/Space'in erişimini miras alır. */
  async clear(itemId: string): Promise<void> {
    const workspaceId = this.cls.get('workspaceId')!;
    const actorId = this.cls.get('userId')!;
    const db = this.tenant.db;
    const item = await db.workItem.findFirst({ where: { id: itemId }, select: { id: true } });
    if (!item) throw notFound();
    await db.$transaction(async (tx) => {
      const removed = await tx.workItemAccess.deleteMany({ where: { itemId } });
      if (removed.count === 0) return;
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'item',
        entityId: itemId,
        action: 'item.access_cleared',
      });
    });
    resetHiddenRoots(this.cls);
  }
}

import { Injectable } from '@nestjs/common';
import {
  checkSpaceRole,
  compareRank,
  DEFAULT_LIST_NAME,
  DEFAULT_STATUSES,
  rankBetween,
  rankForPlacement,
  ranksAfter,
  type Created,
  type CreateSpaceData,
  type Favorite,
  type HierarchyResponse,
  type SpaceDetail,
  type SpaceIcon,
  type SpaceMemberInput,
  type SpaceRole,
  type TreeSpace,
  type UpdateSpaceRequest,
  type WorkspaceRole,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import { RoleScope } from '../../generated/prisma/client';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { SpaceAccessService } from '../access/space-access.service';
import { ActivityService } from '../activity/activity.service';
import { forbidden, isUniqueViolation, keyTaken, notFound } from './space-errors';

/** Space oluşturma, ayarlar, sıralama ve kenar çubuğu ağacı (Faz 1.2). */
@Injectable()
export class SpacesService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly access: SpaceAccessService,
    private readonly activity: ActivityService,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  // ---------- Kenar çubuğu ağacı ----------

  /** Kullanıcının görebildiği, arşivlenmemiş ve silinmemiş yapı + favoriler. */
  async hierarchy(): Promise<HierarchyResponse> {
    const db = this.tenant.db;
    const perms = await this.access.permissionMap({ deletedAt: null });
    const ids = [...perms.keys()];
    const active = { deletedAt: null, archivedAt: null };

    const [spaces, folders, lists, favorites] = await Promise.all([
      db.space.findMany({ where: { id: { in: ids }, ...active }, orderBy: { rank: 'asc' } }),
      db.folder.findMany({ where: { spaceId: { in: ids }, ...active }, orderBy: { rank: 'asc' } }),
      db.list.findMany({
        where: {
          spaceId: { in: ids },
          ...active,
          OR: [{ folderId: null }, { folder: active }],
        },
        orderBy: { rank: 'asc' },
      }),
      db.favorite.findMany({ where: { userId: this.ctx.actorId }, orderBy: { createdAt: 'asc' } }),
    ]);

    const tree: TreeSpace[] = spaces.map((s) => ({
      id: s.id,
      name: s.name,
      key: s.key,
      color: s.color,
      icon: s.icon as SpaceIcon | null,
      isPrivate: s.isPrivate,
      scrumEnabled: s.scrumEnabled,
      permissions: [...perms.get(s.id)!],
      folders: folders
        .filter((f) => f.spaceId === s.id)
        .map((f) => ({
          id: f.id,
          name: f.name,
          lists: lists.filter((l) => l.folderId === f.id).map((l) => ({ id: l.id, name: l.name })),
        })),
      lists: lists
        .filter((l) => l.spaceId === s.id && l.folderId === null)
        .map((l) => ({ id: l.id, name: l.name })),
    }));

    // Favoriler yalnızca görünür ve etkin öğeler için listelenir (ADR-043).
    const visible = new Map<string, Favorite>();
    for (const s of tree) {
      visible.set(`SPACE:${s.id}`, { type: 'SPACE', id: s.id, name: s.name, spaceId: s.id });
      for (const f of s.folders) {
        visible.set(`FOLDER:${f.id}`, { type: 'FOLDER', id: f.id, name: f.name, spaceId: s.id });
        for (const l of f.lists) {
          visible.set(`LIST:${l.id}`, { type: 'LIST', id: l.id, name: l.name, spaceId: s.id });
        }
      }
      for (const l of s.lists) {
        visible.set(`LIST:${l.id}`, { type: 'LIST', id: l.id, name: l.name, spaceId: s.id });
      }
    }
    return {
      spaces: tree,
      favorites: favorites.flatMap((f) => visible.get(`${f.type}:${f.entityId}`) ?? []),
    };
  }

  // ---------- Oluşturma ----------

  async create(input: CreateSpaceData): Promise<Created> {
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    const members = await this.validateMembers(this.withCreator(input.members, actorId));

    if (await db.spaceKey.findFirst({ where: { key: input.key } })) throw keyTaken();

    const actor = await db.membership.findFirstOrThrow({
      where: { userId: actorId },
      select: { user: { select: { locale: true } } },
    });
    const locale = actor.user.locale === 'en' ? 'en' : 'tr';
    const [roleIds, last] = await Promise.all([
      this.spaceRoleIds(),
      db.space.findFirst({ where: { deletedAt: null }, orderBy: { rank: 'desc' } }),
    ]);

    try {
      return await db.$transaction(async (tx) => {
        const space = await tx.space.create({
          data: {
            workspaceId,
            name: input.name,
            key: input.key,
            color: input.color,
            icon: input.icon,
            description: input.description,
            isPrivate: input.isPrivate,
            scrumEnabled: input.scrumEnabled,
            sprintLengthWeeks: input.sprintLengthWeeks,
            sprintGoalRequired: input.sprintGoalRequired,
            estimationScale: input.estimationScale,
            rank: rankBetween(last?.rank ?? null, null),
            createdById: actorId,
          },
        });
        await tx.spaceKey.create({ data: { workspaceId, spaceId: space.id, key: input.key } });

        const statuses = DEFAULT_STATUSES[locale];
        const statusRanks = ranksAfter(null, statuses.length);
        await tx.status.createMany({
          data: statuses.map((s, i) => ({
            workspaceId,
            spaceId: space.id,
            name: s.name,
            color: s.color,
            category: s.category,
            rank: statusRanks[i]!,
          })),
        });
        await tx.list.create({
          data: {
            workspaceId,
            spaceId: space.id,
            name: DEFAULT_LIST_NAME[locale],
            rank: rankBetween(null, null),
          },
        });
        await tx.spaceMember.createMany({
          data: members.map((m) => ({
            workspaceId,
            spaceId: space.id,
            userId: m.userId,
            roleId: roleIds[m.role],
          })),
        });
        await this.activity.record(tx, {
          workspaceId,
          actorId,
          entityType: 'space',
          entityId: space.id,
          action: 'space.created',
          changes: {
            name: input.name,
            key: input.key,
            isPrivate: input.isPrivate,
            members: members.map((m) => ({ userId: m.userId, role: m.role })),
          },
        });
        return { id: space.id };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw keyTaken();
      throw error;
    }
  }

  // ---------- Ayrıntı ve ayarlar ----------

  async detail(spaceId: string): Promise<SpaceDetail> {
    const db = this.tenant.db;
    const space = await db.space.findFirst({
      where: { id: spaceId, deletedAt: null },
      include: {
        statuses: { orderBy: { rank: 'asc' } },
        members: {
          where: { userId: this.ctx.actorId },
          select: { role: { select: { key: true } } },
        },
      },
    });
    if (!space) throw notFound();
    return {
      id: space.id,
      name: space.name,
      key: space.key,
      color: space.color,
      icon: space.icon as SpaceIcon | null,
      description: space.description,
      isPrivate: space.isPrivate,
      scrumEnabled: space.scrumEnabled,
      sprintLengthWeeks: space.sprintLengthWeeks,
      sprintGoalRequired: space.sprintGoalRequired,
      estimationScale: space.estimationScale,
      archived: space.archivedAt !== null,
      myRole: (space.members[0]?.role.key as SpaceRole | undefined) ?? null,
      permissions: [...(this.cls.get('spacePermissions') ?? [])],
      statuses: space.statuses.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        category: s.category,
      })),
      createdAt: space.createdAt.toISOString(),
    };
  }

  /** Ayarları günceller. Anahtar değişirse eski anahtar rezerve kalır (ADR-033). */
  async update(spaceId: string, input: UpdateSpaceRequest): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    const space = await db.space.findFirst({ where: { id: spaceId, deletedAt: null } });
    if (!space) throw notFound();

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [field, value] of Object.entries(input)) {
      const current = space[field as keyof typeof input];
      if (value !== undefined && value !== current) changes[field] = { from: current, to: value };
    }
    if (Object.keys(changes).length === 0) return;

    try {
      await db.$transaction(async (tx) => {
        if (changes.key) {
          const reserved = await tx.spaceKey.findFirst({ where: { key: input.key! } });
          if (reserved && reserved.spaceId !== spaceId) throw keyTaken();
          if (!reserved) {
            await tx.spaceKey.create({ data: { workspaceId, spaceId, key: input.key! } });
          }
        }
        await tx.space.update({ where: { id: spaceId }, data: input });
        await this.activity.record(tx, {
          workspaceId,
          actorId,
          entityType: 'space',
          entityId: spaceId,
          action: 'space.updated',
          changes: changes as Record<string, { from: string; to: string }>,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw keyTaken();
      throw error;
    }
  }

  /** Kenar çubuğundaki ortak Space sırası (ADR-040). */
  async move(spaceId: string, afterId: string | null): Promise<void> {
    const db = this.tenant.db;
    const siblings = await db.space.findMany({
      where: { deletedAt: null },
      select: { id: true, rank: true },
      orderBy: { rank: 'asc' },
    });
    if (!siblings.some((s) => s.id === spaceId)) throw notFound();
    const rank = rankForPlacement(siblings.sort(compareRank), spaceId, afterId);
    if (!rank) throw notFound();
    await db.space.update({ where: { id: spaceId }, data: { rank } });
  }

  // ---------- Yardımcılar ----------

  private withCreator(members: SpaceMemberInput[], actorId: string): SpaceMemberInput[] {
    const unique = new Map(members.map((m) => [m.userId, m]));
    if (!unique.has(actorId)) unique.set(actorId, { userId: actorId, role: 'PRODUCT_OWNER' });
    return [...unique.values()];
  }

  /** Üyeler workspace üyesi olmalı; Guest yalnızca Stakeholder olabilir (ADR-035). */
  private async validateMembers(members: SpaceMemberInput[]): Promise<SpaceMemberInput[]> {
    const memberships = await this.tenant.db.membership.findMany({
      where: { userId: { in: members.map((m) => m.userId) } },
      select: { userId: true, role: { select: { key: true } } },
    });
    const roles = new Map(memberships.map((m) => [m.userId, m.role.key as WorkspaceRole]));
    for (const m of members) {
      const workspaceRole = roles.get(m.userId);
      if (!workspaceRole) throw notFound();
      const check = checkSpaceRole(workspaceRole, m.role);
      if (!check.ok) throw forbidden(check.code);
    }
    return members;
  }

  async spaceRoleIds(): Promise<Record<SpaceRole, string>> {
    const roles = await this.tenant.db.role.findMany({
      where: { scope: RoleScope.SPACE },
      select: { id: true, key: true },
    });
    return Object.fromEntries(roles.map((r) => [r.key, r.id])) as Record<SpaceRole, string>;
  }
}

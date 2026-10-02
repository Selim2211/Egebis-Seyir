import { Injectable } from '@nestjs/common';
import {
  compareRank,
  rankBetween,
  rankForPlacement,
  type Created,
  type FolderDetail,
  type ListDetail,
  type SpaceIcon,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { ActivityService } from '../activity/activity.service';
import { archivedParent, notFound } from './space-errors';

const crumbSpace = { select: { id: true, name: true, color: true, icon: true } } as const;
const active = { deletedAt: null, archivedAt: null } as const;

/** Folder ve List yönetimi (ADR-040, ADR-043). Space izni guard'da kontrol edilir. */
@Injectable()
export class StructureService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly activity: ActivityService,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  // ---------- Okuma ----------

  async folder(folderId: string): Promise<FolderDetail> {
    const folder = await this.tenant.db.folder.findFirst({
      where: { id: folderId, deletedAt: null, space: { deletedAt: null } },
      include: {
        space: { select: { ...crumbSpace.select, archivedAt: true } },
        lists: { where: active, orderBy: { rank: 'asc' }, select: { id: true, name: true } },
      },
    });
    if (!folder) throw notFound();
    const { archivedAt: spaceArchivedAt, ...space } = folder.space;
    return {
      id: folder.id,
      name: folder.name,
      archived: folder.archivedAt !== null || spaceArchivedAt !== null,
      space: { ...space, icon: space.icon as SpaceIcon | null },
      lists: folder.lists,
    };
  }

  async list(listId: string): Promise<ListDetail> {
    const list = await this.tenant.db.list.findFirst({
      where: {
        id: listId,
        deletedAt: null,
        space: { deletedAt: null },
        OR: [{ folderId: null }, { folder: { deletedAt: null } }],
      },
      include: {
        space: { select: { ...crumbSpace.select, archivedAt: true } },
        folder: { select: { id: true, name: true, archivedAt: true } },
      },
    });
    if (!list) throw notFound();
    const { archivedAt: spaceArchivedAt, ...space } = list.space;
    return {
      id: list.id,
      name: list.name,
      archived: list.archivedAt !== null || spaceArchivedAt !== null || !!list.folder?.archivedAt,
      space: { ...space, icon: space.icon as SpaceIcon | null },
      folder: list.folder ? { id: list.folder.id, name: list.folder.name } : null,
    };
  }

  // ---------- Folder ----------

  async createFolder(spaceId: string, name: string): Promise<Created> {
    const { workspaceId, actorId } = this.ctx;
    await this.activeSpace(spaceId);
    const last = await this.tenant.db.folder.findFirst({
      where: { spaceId, deletedAt: null },
      orderBy: { rank: 'desc' },
    });
    return this.tenant.db.$transaction(async (tx) => {
      const folder = await tx.folder.create({
        data: { workspaceId, spaceId, name, rank: rankBetween(last?.rank ?? null, null) },
      });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'folder',
        entityId: folder.id,
        action: 'folder.created',
        changes: { name, spaceId },
      });
      return { id: folder.id };
    });
  }

  async renameFolder(folderId: string, name: string): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const folder = await this.tenant.db.folder.findFirst({
      where: { id: folderId, deletedAt: null },
    });
    if (!folder) throw notFound();
    if (folder.name === name) return;
    await this.tenant.db.$transaction(async (tx) => {
      await tx.folder.update({ where: { id: folderId }, data: { name } });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'folder',
        entityId: folderId,
        action: 'folder.renamed',
        changes: { name: { from: folder.name, to: name } },
      });
    });
  }

  async moveFolder(folderId: string, afterId: string | null): Promise<void> {
    const db = this.tenant.db;
    const folder = await db.folder.findFirst({ where: { id: folderId, deletedAt: null } });
    if (!folder) throw notFound();
    const siblings = await db.folder.findMany({
      where: { spaceId: folder.spaceId, deletedAt: null },
      select: { id: true, rank: true },
    });
    const rank = rankForPlacement(siblings.sort(compareRank), folderId, afterId);
    if (!rank) throw notFound();
    await db.folder.update({ where: { id: folderId }, data: { rank } });
  }

  // ---------- List ----------

  async createList(spaceId: string, name: string, folderId: string | null): Promise<Created> {
    const { workspaceId, actorId } = this.ctx;
    await this.activeSpace(spaceId);
    if (folderId) await this.activeFolder(spaceId, folderId);
    const last = await this.tenant.db.list.findFirst({
      where: { spaceId, folderId, deletedAt: null },
      orderBy: { rank: 'desc' },
    });
    return this.tenant.db.$transaction(async (tx) => {
      const list = await tx.list.create({
        data: {
          workspaceId,
          spaceId,
          folderId,
          name,
          rank: rankBetween(last?.rank ?? null, null),
        },
      });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'list',
        entityId: list.id,
        action: 'list.created',
        changes: { name, spaceId, folderId },
      });
      return { id: list.id };
    });
  }

  async renameList(listId: string, name: string): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const list = await this.tenant.db.list.findFirst({ where: { id: listId, deletedAt: null } });
    if (!list) throw notFound();
    if (list.name === name) return;
    await this.tenant.db.$transaction(async (tx) => {
      await tx.list.update({ where: { id: listId }, data: { name } });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'list',
        entityId: listId,
        action: 'list.renamed',
        changes: { name: { from: list.name, to: name } },
      });
    });
  }

  /** Aynı Space içinde Folder'lar ve kök arasında taşır, sıralar (ADR-043). */
  async moveList(listId: string, folderId: string | null, afterId: string | null): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    const list = await db.list.findFirst({ where: { id: listId, deletedAt: null } });
    if (!list) throw notFound();
    if (folderId && folderId !== list.folderId) await this.activeFolder(list.spaceId, folderId);

    const siblings = await db.list.findMany({
      where: { spaceId: list.spaceId, folderId, deletedAt: null },
      select: { id: true, rank: true },
    });
    const rank = rankForPlacement(siblings.sort(compareRank), listId, afterId);
    if (!rank) throw notFound();

    await db.$transaction(async (tx) => {
      await tx.list.update({ where: { id: listId }, data: { folderId, rank } });
      if (folderId !== list.folderId) {
        await this.activity.record(tx, {
          workspaceId,
          actorId,
          entityType: 'list',
          entityId: listId,
          action: 'list.moved',
          changes: { folderId: { from: list.folderId, to: folderId } },
        });
      }
    });
  }

  // ---------- Yardımcılar ----------

  private async activeSpace(spaceId: string): Promise<void> {
    const space = await this.tenant.db.space.findFirst({
      where: { id: spaceId, deletedAt: null },
      select: { archivedAt: true },
    });
    if (!space) throw notFound();
    if (space.archivedAt) throw archivedParent();
  }

  private async activeFolder(spaceId: string, folderId: string): Promise<void> {
    const folder = await this.tenant.db.folder.findFirst({
      where: { id: folderId, spaceId, deletedAt: null },
      select: { archivedAt: true },
    });
    if (!folder) throw notFound();
    if (folder.archivedAt) throw archivedParent();
  }
}

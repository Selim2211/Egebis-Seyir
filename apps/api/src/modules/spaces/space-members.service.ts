import { Injectable } from '@nestjs/common';
import {
  checkSpaceRole,
  type SpaceMember,
  type SpaceRole,
  type WorkspaceRole,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import { RoleScope } from '../../generated/prisma/client';
import type { AppClsStore } from '../../infra/cls/request-context';
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
  ) {}

  async list(spaceId: string): Promise<SpaceMember[]> {
    const db = this.tenant.db;
    await this.ensureSpace(spaceId);
    const members = await db.spaceMember.findMany({
      where: { spaceId },
      include: {
        role: { select: { key: true } },
        user: { select: { id: true, name: true, title: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const memberships = await db.membership.findMany({
      where: { userId: { in: members.map((m) => m.userId) } },
      select: { userId: true, role: { select: { key: true } } },
    });
    const workspaceRoles = new Map(memberships.map((m) => [m.userId, m.role.key]));
    return members.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      title: m.user.title,
      role: m.role.key as SpaceRole,
      workspaceRole: (workspaceRoles.get(m.userId) ?? 'GUEST') as WorkspaceRole,
    }));
  }

  /** Üye ekler veya Scrum rolünü değiştirir. */
  async put(spaceId: string, userId: string, role: SpaceRole): Promise<void> {
    const workspaceId = this.cls.get('workspaceId')!;
    const db = this.tenant.db;
    await this.ensureSpace(spaceId);

    const membership = await db.membership.findFirst({
      where: { userId },
      select: { role: { select: { key: true } } },
    });
    if (!membership) throw notFound();
    const check = checkSpaceRole(membership.role.key as WorkspaceRole, role);
    if (!check.ok) throw forbidden(check.code);

    const spaceRole = await db.role.findFirstOrThrow({
      where: { scope: RoleScope.SPACE, key: role },
      select: { id: true },
    });
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

  async remove(spaceId: string, userId: string): Promise<void> {
    const workspaceId = this.cls.get('workspaceId')!;
    await this.ensureSpace(spaceId);
    await this.tenant.db.$transaction(async (tx) => {
      const existing = await tx.spaceMember.findFirst({
        where: { spaceId, userId },
        include: { role: { select: { key: true } } },
      });
      if (!existing) throw notFound();
      await tx.spaceMember.delete({ where: { id: existing.id } });
      await this.activity.record(tx, {
        workspaceId,
        actorId: this.cls.get('userId')!,
        entityType: 'space',
        entityId: spaceId,
        action: 'space.member_removed',
        changes: { userId, role: { from: existing.role.key, to: null } },
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

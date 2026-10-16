import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CUSTOM_ROLE_PREFIX,
  DEFAULT_SPACE_ROLE_PERMISSIONS,
  DEFAULT_WORKSPACE_ROLE_PERMISSIONS,
  ERROR_CODES,
  type CreateRoleRequest,
  type Created,
  type Role,
  type RoleScopeName,
  type UpdateRoleRequest,
  validateRolePermissions,
} from '@scrum/shared';
import { randomUUID } from 'node:crypto';
import { ClsService } from 'nestjs-cls';
import { RoleScope } from '../../generated/prisma/client';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { ActivityService } from '../activity/activity.service';

const notFound = () => new NotFoundException({ code: ERROR_CODES.ROLE_NOT_FOUND });

/** Özel roller ve sistem rollerinin izin düzenlemesi (Ayarlar → Roles, ADR-112). */
@Injectable()
export class RolesService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly activity: ActivityService,
  ) {}

  async list(): Promise<Role[]> {
    const db = this.tenant.db;
    const [roles, members, spaceMembers, invitations] = await Promise.all([
      db.role.findMany({ orderBy: [{ scope: 'asc' }, { createdAt: 'asc' }] }),
      db.membership.groupBy({ by: ['roleId'], _count: { _all: true } }),
      db.spaceMember.groupBy({ by: ['roleId'], _count: { _all: true } }),
      db.invitation.groupBy({
        by: ['roleId'],
        where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        _count: { _all: true },
      }),
    ]);
    const count = new Map<string, number>();
    for (const row of [...members, ...spaceMembers, ...invitations]) {
      count.set(row.roleId, (count.get(row.roleId) ?? 0) + row._count._all);
    }
    return roles.map((r) => ({
      id: r.id,
      scope: r.scope,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissions: r.permissions,
      memberCount: count.get(r.id) ?? 0,
    }));
  }

  async create(input: CreateRoleRequest): Promise<Created> {
    const { workspaceId, userId: actorId } = this.cls.get() as Required<
      Pick<AppClsStore, 'workspaceId' | 'userId'>
    >;
    const check = validateRolePermissions({
      scope: input.scope,
      systemKey: null,
      permissions: input.permissions,
    });
    if (!check.ok) throw new ConflictException({ code: check.code });
    await this.assertNameFree(input.scope, input.name, null);

    return this.tenant.db.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          workspaceId,
          scope: input.scope,
          key: `${CUSTOM_ROLE_PREFIX}${randomUUID()}`,
          name: input.name,
          description: input.description ?? null,
          // Özel workspace rolü "Member" katmanında kalır; Owner/Admin ayrıcalıkları verilmez.
          baseKey: input.scope === 'WORKSPACE' ? 'MEMBER' : null,
          permissions: input.permissions,
          isSystem: false,
        },
      });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'role',
        entityId: role.id,
        action: 'role.created',
        changes: { name: input.name, scope: input.scope, permissions: input.permissions },
      });
      return { id: role.id };
    });
  }

  async update(roleId: string, input: UpdateRoleRequest): Promise<void> {
    const { workspaceId, userId: actorId } = this.cls.get() as Required<
      Pick<AppClsStore, 'workspaceId' | 'userId'>
    >;
    const role = await this.tenant.db.role.findFirst({ where: { id: roleId } });
    if (!role) throw notFound();
    const scope: RoleScopeName = role.scope;
    if (role.isSystem && role.key === 'OWNER') {
      throw new ForbiddenException({ code: ERROR_CODES.ROLE_LOCKED });
    }
    if (role.isSystem && input.name !== undefined) {
      throw new ForbiddenException({ code: ERROR_CODES.ROLE_LOCKED });
    }
    if (input.permissions) {
      const check = validateRolePermissions({
        scope,
        systemKey: role.isSystem ? role.key : null,
        permissions: input.permissions,
      });
      if (!check.ok) throw new ConflictException({ code: check.code });
    }
    if (input.name !== undefined) await this.assertNameFree(scope, input.name, role.id);

    await this.tenant.db.$transaction(async (tx) => {
      await tx.role.update({
        where: { id: role.id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.permissions && { permissions: input.permissions }),
        },
      });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'role',
        entityId: role.id,
        action: 'role.updated',
        changes: {
          ...(input.name !== undefined && { name: { from: role.name, to: input.name } }),
          ...(input.permissions && {
            permissions: {
              added: input.permissions.filter((p) => !role.permissions.includes(p)),
              removed: role.permissions.filter((p) => !input.permissions!.includes(p)),
            },
          }),
        },
      });
    });
  }

  /** Sistem rolünün izinlerini varsayılana döndürür. */
  async reset(roleId: string): Promise<void> {
    const { workspaceId, userId: actorId } = this.cls.get() as Required<
      Pick<AppClsStore, 'workspaceId' | 'userId'>
    >;
    const role = await this.tenant.db.role.findFirst({ where: { id: roleId } });
    if (!role) throw notFound();
    if (!role.isSystem || role.key === 'OWNER') {
      throw new ForbiddenException({ code: ERROR_CODES.ROLE_LOCKED });
    }
    const defaults =
      role.scope === RoleScope.WORKSPACE
        ? (DEFAULT_WORKSPACE_ROLE_PERMISSIONS as Record<string, readonly string[]>)[role.key]
        : (DEFAULT_SPACE_ROLE_PERMISSIONS as Record<string, readonly string[]>)[role.key];
    if (!defaults) throw notFound();
    await this.tenant.db.$transaction(async (tx) => {
      await tx.role.update({ where: { id: role.id }, data: { permissions: [...defaults] } });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'role',
        entityId: role.id,
        action: 'role.reset',
      });
    });
  }

  async remove(roleId: string, reassignToRoleId?: string): Promise<void> {
    const { workspaceId, userId: actorId } = this.cls.get() as Required<
      Pick<AppClsStore, 'workspaceId' | 'userId'>
    >;
    const db = this.tenant.db;
    const role = await db.role.findFirst({ where: { id: roleId } });
    if (!role) throw notFound();
    if (role.isSystem) throw new ForbiddenException({ code: ERROR_CODES.ROLE_LOCKED });

    const usage = await Promise.all([
      db.membership.count({ where: { roleId } }),
      db.spaceMember.count({ where: { roleId } }),
      db.invitation.count({
        where: { roleId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      }),
    ]);
    const inUse = usage.some((n) => n > 0);
    let target: { id: string } | null = null;
    if (inUse) {
      if (!reassignToRoleId) throw new ConflictException({ code: ERROR_CODES.ROLE_IN_USE });
      target = await db.role.findFirst({
        where: {
          id: reassignToRoleId,
          scope: role.scope,
          NOT: [{ id: roleId }, { key: 'OWNER' }],
        },
        select: { id: true },
      });
      if (!target) throw notFound();
    }

    await db.$transaction(async (tx) => {
      if (target) {
        await tx.membership.updateMany({ where: { roleId }, data: { roleId: target.id } });
        await tx.spaceMember.updateMany({ where: { roleId }, data: { roleId: target.id } });
        await tx.invitation.updateMany({ where: { roleId }, data: { roleId: target.id } });
      } else {
        // Kullanılmayan rol: süresi dolmuş/kabul edilmiş eski davetler rolle birlikte silinir.
        await tx.invitation.deleteMany({ where: { roleId } });
      }
      await tx.role.delete({ where: { id: roleId } });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'role',
        entityId: roleId,
        action: 'role.deleted',
        changes: { name: role.name, reassignedTo: target?.id ?? null },
      });
    });
  }

  private async assertNameFree(scope: RoleScopeName, name: string, exceptId: string | null) {
    const clash = await this.tenant.db.role.findFirst({
      where: {
        scope,
        isSystem: false,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId && { NOT: { id: exceptId } }),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException({ code: ERROR_CODES.ROLE_NAME_TAKEN });
  }
}

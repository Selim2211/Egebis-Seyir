import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { checkMemberChange, ERROR_CODES, type Member, type WorkspaceRole } from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import { RoleScope } from '../../generated/prisma/client';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { ActivityService } from '../activity/activity.service';

@Injectable()
export class MembersService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly activity: ActivityService,
  ) {}

  async list(): Promise<Member[]> {
    const memberships = await this.tenant.db.membership.findMany({
      include: {
        role: { select: { key: true } },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            title: true,
            sessions: { select: { lastSeenAt: true }, orderBy: { lastSeenAt: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      title: m.user.title,
      role: m.role.key as WorkspaceRole,
      joinedAt: m.createdAt.toISOString(),
      lastSeenAt: m.user.sessions[0]?.lastSeenAt.toISOString() ?? null,
    }));
  }

  /** Rol değiştirir (`newRole`) veya üyeyi çıkarır (`null`). Owner kuralları shared'dadır. */
  async change(targetUserId: string, newRole: WorkspaceRole | null): Promise<void> {
    const workspaceId = this.cls.get('workspaceId')!;
    const actorRole = this.cls.get('workspaceRole')!;
    const actorId = this.cls.get('userId')!;

    await this.tenant.db.$transaction(async (tx) => {
      const target = await tx.membership.findFirst({
        where: { userId: targetUserId },
        include: { role: { select: { key: true } } },
      });
      if (!target) throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND });

      const targetRole = target.role.key as WorkspaceRole;
      if (newRole === targetRole) return;
      const ownerCount = await tx.membership.count({
        where: { role: { scope: RoleScope.WORKSPACE, key: 'OWNER' } },
      });
      const check = checkMemberChange({ actorRole, targetRole, newRole, ownerCount });
      if (!check.ok) throw new ForbiddenException({ code: check.code });

      if (newRole === null) {
        await tx.membership.delete({ where: { id: target.id } });
      } else {
        const role = await tx.role.findFirstOrThrow({
          where: { scope: RoleScope.WORKSPACE, key: newRole },
        });
        await tx.membership.update({ where: { id: target.id }, data: { roleId: role.id } });
      }
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'member',
        entityId: targetUserId,
        action: newRole === null ? 'member.removed' : 'member.role_changed',
        changes: { role: { from: targetRole, to: newRole } },
      });
    });
  }
}

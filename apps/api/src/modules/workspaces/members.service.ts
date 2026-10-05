import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  checkMemberChange,
  type CreatedMember,
  type CreateMemberData,
  ERROR_CODES,
  type Member,
  type WorkspaceRole,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import { RoleScope } from '../../generated/prisma/client';
import type { AppClsStore } from '../../infra/cls/request-context';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { hashPassword } from '../../infra/security/password';
import { AccessService } from '../access/access.service';
import { ActivityService } from '../activity/activity.service';

/** Karışması kolay karakterler (0/O, 1/l/I) olmayan, okunabilir geçici şifre. */
const PASSWORD_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generatePassword(length = 12): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join('');
}

@Injectable()
export class MembersService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly activity: ActivityService,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /**
   * Yönetici hesabı doğrudan açar (ADR-092): davet e-postası gerekmez. E-posta zaten bir hesaba
   * aitse (başka workspace'te) yalnızca bu workspace'e eklenir; şifresine dokunulmaz.
   */
  async createAccount(input: CreateMemberData): Promise<CreatedMember> {
    const workspaceId = this.cls.get('workspaceId')!;
    const actorId = this.cls.get('userId')!;
    const sharedSpaceIds = input.role === 'GUEST' ? [...new Set(input.spaceIds)] : [];
    if (sharedSpaceIds.length > 0) {
      const found = await this.tenant.db.space.count({
        where: { id: { in: sharedSpaceIds }, deletedAt: null },
      });
      if (found !== sharedSpaceIds.length) {
        throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND });
      }
    }

    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      const member = await this.tenant.db.membership.findFirst({
        where: { userId: existing.id },
        select: { id: true },
      });
      if (member) {
        throw new ConflictException({
          code: ERROR_CODES.ALREADY_MEMBER,
          details: { emails: [input.email] },
        });
      }
    }

    const roleId = await this.access.workspaceRoleId(workspaceId, input.role);
    const temporaryPassword = existing || input.password ? null : generatePassword();
    const passwordHash = existing
      ? undefined
      : await hashPassword(input.password ?? temporaryPassword!);

    const userId = await this.prisma.$transaction(async (tx) => {
      const id =
        existing?.id ??
        (
          await tx.user.create({
            data: {
              email: input.email,
              name: input.name,
              passwordHash: passwordHash!,
              locale: input.locale,
            },
          })
        ).id;
      await tx.membership.create({ data: { workspaceId, userId: id, roleId } });
      if (sharedSpaceIds.length > 0) {
        // Guest, paylaşılan Space'lere Stakeholder olarak eklenir (ADR-035, ADR-043).
        const stakeholder = await tx.role.findUniqueOrThrow({
          where: {
            workspaceId_scope_key: { workspaceId, scope: RoleScope.SPACE, key: 'STAKEHOLDER' },
          },
        });
        await tx.spaceMember.createMany({
          data: sharedSpaceIds.map((spaceId) => ({
            workspaceId,
            spaceId,
            userId: id,
            roleId: stakeholder.id,
          })),
          skipDuplicates: true,
        });
      }
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'member',
        entityId: id,
        action: 'member.created',
        changes: { email: input.email, role: input.role, existingAccount: !!existing },
      });
      return id;
    });
    return { userId, temporaryPassword, existingAccount: !!existing };
  }

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
            avatarVersion: true,
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
      avatarVersion: m.user.avatarVersion,
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
        await tx.spaceMember.deleteMany({ where: { userId: targetUserId } });
        await tx.favorite.deleteMany({ where: { userId: targetUserId } });
        await tx.workItemAssignee.deleteMany({ where: { userId: targetUserId } });
      } else {
        const role = await tx.role.findFirstOrThrow({
          where: { scope: RoleScope.WORKSPACE, key: newRole },
        });
        await tx.membership.update({ where: { id: target.id }, data: { roleId: role.id } });
        if (newRole === 'GUEST') {
          // Guest Space'lerde yalnızca Stakeholder olabilir (ADR-035, ADR-043).
          const stakeholder = await tx.role.findFirstOrThrow({
            where: { scope: RoleScope.SPACE, key: 'STAKEHOLDER' },
          });
          await tx.spaceMember.updateMany({
            where: { userId: targetUserId },
            data: { roleId: stakeholder.id },
          });
        }
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

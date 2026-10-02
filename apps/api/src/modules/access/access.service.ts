import { Injectable } from '@nestjs/common';
import {
  DEFAULT_SPACE_ROLE_PERMISSIONS,
  DEFAULT_WORKSPACE_ROLE_PERMISSIONS,
  type MeResponse,
  type MyWorkspace,
  type User,
  type WorkspaceRole,
} from '@scrum/shared';
import { type Prisma, RoleScope } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

type Tx = Prisma.TransactionClient;

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Yeni workspace için sistem rollerini shared varsayılanlarından kopyalar (ADR-011). */
  async createSystemRoles(tx: Tx, workspaceId: string): Promise<Record<WorkspaceRole, string>> {
    await tx.role.createMany({
      data: [
        ...Object.entries(DEFAULT_WORKSPACE_ROLE_PERMISSIONS).map(([key, permissions]) => ({
          workspaceId,
          scope: RoleScope.WORKSPACE,
          key,
          permissions: [...permissions],
        })),
        ...Object.entries(DEFAULT_SPACE_ROLE_PERMISSIONS).map(([key, permissions]) => ({
          workspaceId,
          scope: RoleScope.SPACE,
          key,
          permissions: [...permissions],
        })),
      ],
    });
    const roles = await tx.role.findMany({
      where: { workspaceId, scope: RoleScope.WORKSPACE },
      select: { id: true, key: true },
    });
    return Object.fromEntries(roles.map((r) => [r.key, r.id])) as Record<WorkspaceRole, string>;
  }

  async workspaceRoleId(
    workspaceId: string,
    role: WorkspaceRole,
    db: Tx | PrismaService = this.prisma,
  ): Promise<string> {
    const found = await db.role.findUniqueOrThrow({
      where: { workspaceId_scope_key: { workspaceId, scope: RoleScope.WORKSPACE, key: role } },
      select: { id: true },
    });
    return found.id;
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          include: { workspace: { select: { id: true, name: true } }, role: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const workspaces: MyWorkspace[] = user.memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      role: m.role.key as WorkspaceRole,
      permissions: m.role.permissions,
    }));
    return { user: toUserDto(user), workspaces };
  }
}

export function toUserDto(u: {
  id: string;
  email: string;
  name: string;
  title: string | null;
  locale: string;
  theme: string;
  timezone: string;
  avatarVersion: string | null;
}): User {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    title: u.title,
    locale: u.locale === 'en' ? 'en' : 'tr',
    theme: u.theme === 'light' || u.theme === 'dark' ? u.theme : 'system',
    timezone: u.timezone,
    avatarVersion: u.avatarVersion,
  };
}

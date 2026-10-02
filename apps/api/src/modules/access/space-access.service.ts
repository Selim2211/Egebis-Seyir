import { Injectable } from '@nestjs/common';
import { spacePermissions, type WorkspaceRole } from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import { RoleScope } from '../../generated/prisma/client';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';

/** Rota parametreleri: Space bunlardan birinden çözülür. */
export interface SpaceRouteParams {
  spaceId?: string;
  folderId?: string;
  listId?: string;
  itemId?: string;
  labelId?: string;
}

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Space görünürlüğü ve etkin Space izinleri (ADR-039). Kural shared'daki saf
 * `spacePermissions` fonksiyonundadır; burası yalnızca veriyi toplar.
 */
@Injectable()
export class SpaceAccessService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  /** Rota parametresinden Space id'si (silinmiş kayıtlar dahil; servisler ayrıca kontrol eder). */
  async resolveSpaceId(params: SpaceRouteParams): Promise<string | null> {
    const db = this.tenant.db;
    if (params.spaceId) return UUID.test(params.spaceId) ? params.spaceId : null;
    if (params.folderId && UUID.test(params.folderId)) {
      const folder = await db.folder.findFirst({
        where: { id: params.folderId },
        select: { spaceId: true },
      });
      return folder?.spaceId ?? null;
    }
    if (params.listId && UUID.test(params.listId)) {
      const list = await db.list.findFirst({
        where: { id: params.listId },
        select: { spaceId: true },
      });
      return list?.spaceId ?? null;
    }
    if (params.itemId && UUID.test(params.itemId)) {
      const item = await db.workItem.findFirst({
        where: { id: params.itemId },
        select: { spaceId: true },
      });
      return item?.spaceId ?? null;
    }
    if (params.labelId && UUID.test(params.labelId)) {
      const label = await db.label.findFirst({
        where: { id: params.labelId },
        select: { spaceId: true },
      });
      return label?.spaceId ?? null;
    }
    return null;
  }

  /**
   * Verilen kullanıcılardan Space'i görebilenler (mention önerisi ve doğrulaması, ADR-055).
   * Kural kullanıcı başına shared `spacePermissions` ile aynıdır (ADR-039).
   */
  async viewers(spaceId: string, userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const db = this.tenant.db;
    const [space, stakeholder, memberships, spaceMembers] = await Promise.all([
      db.space.findFirst({ where: { id: spaceId }, select: { isPrivate: true } }),
      db.role.findFirstOrThrow({
        where: { scope: RoleScope.SPACE, key: 'STAKEHOLDER' },
        select: { permissions: true },
      }),
      db.membership.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, role: { select: { key: true } } },
      }),
      db.spaceMember.findMany({
        where: { spaceId, userId: { in: userIds } },
        select: { userId: true, role: { select: { permissions: true } } },
      }),
    ]);
    if (!space) return new Set();
    const memberPerms = new Map(spaceMembers.map((m) => [m.userId, m.role.permissions]));
    return new Set(
      memberships
        .filter(
          (m) =>
            spacePermissions({
              workspaceRole: m.role.key as WorkspaceRole,
              isPrivate: space.isPrivate,
              memberPermissions: memberPerms.get(m.userId) ?? null,
              stakeholderPermissions: stakeholder.permissions,
            }) !== null,
        )
        .map((m) => m.userId),
    );
  }

  /** İstekteki kullanıcının Space'teki izinleri; null = görünmez. */
  async permissionsIn(spaceId: string): Promise<readonly string[] | null> {
    const map = await this.permissionMap({ id: spaceId });
    return map.get(spaceId) ?? null;
  }

  /**
   * Koşula uyan Space'ler için kullanıcının izinleri; görünmeyenler haritada yer almaz.
   * Silinmiş Space'ler de değerlendirilir (çöp kutusu için); filtreyi çağıran verir.
   */
  async permissionMap(where: { id?: string | { in: string[] }; deletedAt?: null } = {}) {
    const userId = this.cls.get('userId')!;
    const workspaceRole: WorkspaceRole = this.cls.get('workspaceRole');
    const [spaces, stakeholder] = await Promise.all([
      this.tenant.db.space.findMany({
        where,
        select: {
          id: true,
          isPrivate: true,
          members: { where: { userId }, select: { role: { select: { permissions: true } } } },
        },
      }),
      this.tenant.db.role.findFirstOrThrow({
        where: { scope: RoleScope.SPACE, key: 'STAKEHOLDER' },
        select: { permissions: true },
      }),
    ]);

    const result = new Map<string, readonly string[]>();
    for (const space of spaces) {
      const perms = spacePermissions({
        workspaceRole,
        isPrivate: space.isPrivate,
        memberPermissions: space.members[0]?.role.permissions ?? null,
        stakeholderPermissions: stakeholder.permissions,
      });
      if (perms) result.set(space.id, perms);
    }
    return result;
  }
}

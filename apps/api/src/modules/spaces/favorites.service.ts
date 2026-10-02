import { Injectable } from '@nestjs/common';
import type { FavoriteType } from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { SpaceAccessService } from '../access/space-access.service';
import { notFound } from './space-errors';

/** Kişisel favoriler (brief §5.2). Yalnızca görülebilen öğe favoriye eklenir. */
@Injectable()
export class FavoritesService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly access: SpaceAccessService,
  ) {}

  async add(type: FavoriteType, entityId: string): Promise<void> {
    const workspaceId = this.cls.get('workspaceId')!;
    const userId = this.cls.get('userId')!;
    const spaceId = await this.spaceOf(type, entityId);
    if (!spaceId || !(await this.access.permissionsIn(spaceId))) throw notFound();
    await this.tenant.db.favorite.upsert({
      where: { userId_type_entityId: { userId, type, entityId } },
      create: { workspaceId, userId, type, entityId },
      update: {},
    });
  }

  async remove(type: FavoriteType, entityId: string): Promise<void> {
    await this.tenant.db.favorite.deleteMany({
      where: { userId: this.cls.get('userId')!, type, entityId },
    });
  }

  private async spaceOf(type: FavoriteType, id: string): Promise<string | null> {
    const db = this.tenant.db;
    const where = { id, deletedAt: null };
    if (type === 'SPACE') return (await db.space.findFirst({ where }))?.id ?? null;
    if (type === 'FOLDER') return (await db.folder.findFirst({ where }))?.spaceId ?? null;
    return (await db.list.findFirst({ where }))?.spaceId ?? null;
  }
}

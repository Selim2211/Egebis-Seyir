import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  MAX_SAVED_VIEWS_PER_USER,
  SPACE_PERMISSIONS as S,
  type Created,
  type CreateSavedViewRequest,
  type SavedView,
  type SavedViewsResponse,
  type UpdateSavedViewRequest,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { forbidden, isUniqueViolation, notFound } from '../spaces/space-errors';
import { asJson, fail } from '../work-items/item-support';

const conflict = (code: string) => new HttpException({ code }, HttpStatus.CONFLICT);

/** Kayıtlı görünümler (Faz 5.1, ADR-079): List başına kişisel ve paylaşımlı süzgeç/görünüm ayarları. */
@Injectable()
export class SavedViewsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  private can(permission: string): boolean {
    return (this.cls.get('spacePermissions') ?? []).includes(permission);
  }

  private async assertList(listId: string): Promise<void> {
    const list = await this.tenant.db.list.findFirst({
      where: { id: listId, deletedAt: null, space: { deletedAt: null } },
      select: { id: true },
    });
    if (!list) throw notFound();
  }

  async list(listId: string): Promise<SavedViewsResponse> {
    const { actorId } = this.ctx;
    await this.assertList(listId);
    const rows = await this.tenant.db.savedView.findMany({
      where: { listId, OR: [{ shared: true }, { ownerId: actorId }] },
      include: { owner: { select: { id: true, name: true } } },
    });
    const moderator = this.can(S.SPACE_SETTINGS);
    const views: SavedView[] = rows
      .map((row) => ({
        id: row.id,
        name: row.name,
        shared: row.shared,
        owner: row.owner,
        mine: row.ownerId === actorId,
        config: row.config as SavedView['config'],
        canEdit: row.ownerId === actorId || moderator,
      }))
      // Önce benimkiler, sonra paylaşılanlar; her grup ada göre.
      .sort((a, b) => Number(b.mine) - Number(a.mine) || a.name.localeCompare(b.name, 'tr'));
    return { views };
  }

  async create(listId: string, input: CreateSavedViewRequest): Promise<Created> {
    const { workspaceId, actorId } = this.ctx;
    await this.assertList(listId);
    // Paylaşım, ekibi ilgilendirdiği için düzenleme yetkisi ister; kişisel görünüm herkese açık.
    if (input.shared && !this.can(S.WORK_ITEM_WRITE)) {
      throw forbidden(ERROR_CODES.SAVED_VIEW_SHARE_FORBIDDEN);
    }
    const count = await this.tenant.db.savedView.count({ where: { listId, ownerId: actorId } });
    if (count >= MAX_SAVED_VIEWS_PER_USER) throw fail(ERROR_CODES.SAVED_VIEW_LIMIT);
    try {
      const view = await this.tenant.db.savedView.create({
        data: {
          workspaceId,
          listId,
          ownerId: actorId,
          name: input.name,
          shared: input.shared ?? false,
          config: asJson(input.config),
        },
      });
      return { id: view.id };
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict(ERROR_CODES.SAVED_VIEW_NAME_TAKEN);
      throw error;
    }
  }

  private async editable(listId: string, viewId: string) {
    const { actorId } = this.ctx;
    await this.assertList(listId);
    const view = await this.tenant.db.savedView.findFirst({ where: { id: viewId, listId } });
    // Başkasının kişisel görünümü var olduğu bile sızdırılmaz.
    if (!view || (!view.shared && view.ownerId !== actorId)) throw notFound();
    if (view.ownerId !== actorId && !this.can(S.SPACE_SETTINGS)) {
      throw forbidden(ERROR_CODES.FORBIDDEN);
    }
    return view;
  }

  async update(listId: string, viewId: string, input: UpdateSavedViewRequest): Promise<void> {
    const view = await this.editable(listId, viewId);
    if (input.shared === true && !view.shared && !this.can(S.WORK_ITEM_WRITE)) {
      throw forbidden(ERROR_CODES.SAVED_VIEW_SHARE_FORBIDDEN);
    }
    try {
      await this.tenant.db.savedView.update({
        where: { id: viewId },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.shared !== undefined && { shared: input.shared }),
          ...(input.config !== undefined && { config: asJson(input.config) }),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict(ERROR_CODES.SAVED_VIEW_NAME_TAKEN);
      throw error;
    }
  }

  async remove(listId: string, viewId: string): Promise<void> {
    await this.editable(listId, viewId);
    await this.tenant.db.savedView.delete({ where: { id: viewId } });
  }
}

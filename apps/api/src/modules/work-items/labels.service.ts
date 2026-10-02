import { ConflictException, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type Created,
  type CreateLabelRequest,
  type Label,
  type UpdateLabelRequest,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { ActivityService } from '../activity/activity.service';
import { isUniqueViolation, notFound } from '../spaces/space-errors';

const taken = () => new ConflictException({ code: ERROR_CODES.LABEL_NAME_TAKEN });

/** Space etiketleri. Ad Space içinde benzersizdir (büyük/küçük harf duyarsız). */
@Injectable()
export class LabelsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly activity: ActivityService,
  ) {}

  async list(spaceId: string): Promise<Label[]> {
    const labels = await this.tenant.db.label.findMany({
      where: { spaceId, space: { deletedAt: null } },
      orderBy: { name: 'asc' },
    });
    return labels.map(({ id, name, color }) => ({ id, name, color }));
  }

  async create(spaceId: string, input: CreateLabelRequest): Promise<Created> {
    const workspaceId = this.cls.get('workspaceId')!;
    const db = this.tenant.db;
    const name = input.name.trim();
    const space = await db.space.findFirst({ where: { id: spaceId, deletedAt: null } });
    if (!space) throw notFound();
    if (await this.nameTaken(spaceId, name)) throw taken();
    try {
      return await db.$transaction(async (tx) => {
        const label = await tx.label.create({
          data: { workspaceId, spaceId, name, color: input.color ?? '#64748B' },
        });
        await this.activity.record(tx, {
          workspaceId,
          actorId: this.cls.get('userId')!,
          entityType: 'label',
          entityId: label.id,
          action: 'label.created',
          changes: { name, spaceId },
        });
        return { id: label.id };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw taken();
      throw error;
    }
  }

  async update(labelId: string, input: UpdateLabelRequest): Promise<void> {
    const workspaceId = this.cls.get('workspaceId')!;
    const db = this.tenant.db;
    const label = await db.label.findFirst({ where: { id: labelId } });
    if (!label) throw notFound();
    const name = input.name?.trim();
    if (
      name &&
      name.toLowerCase() !== label.name.toLowerCase() &&
      (await this.nameTaken(label.spaceId, name))
    ) {
      throw taken();
    }
    try {
      await db.$transaction(async (tx) => {
        await tx.label.update({
          where: { id: labelId },
          data: { ...(name && { name }), ...(input.color && { color: input.color }) },
        });
        await this.activity.record(tx, {
          workspaceId,
          actorId: this.cls.get('userId')!,
          entityType: 'label',
          entityId: labelId,
          action: 'label.updated',
          changes: { name: { from: label.name, to: name ?? label.name } },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw taken();
      throw error;
    }
  }

  /** Etiket silinince öğelerden de kalkar (cascade). */
  async remove(labelId: string): Promise<void> {
    const workspaceId = this.cls.get('workspaceId')!;
    await this.tenant.db.$transaction(async (tx) => {
      const label = await tx.label.findFirst({ where: { id: labelId } });
      if (!label) throw notFound();
      await tx.label.delete({ where: { id: labelId } });
      await this.activity.record(tx, {
        workspaceId,
        actorId: this.cls.get('userId')!,
        entityType: 'label',
        entityId: labelId,
        action: 'label.deleted',
        changes: { name: label.name, spaceId: label.spaceId },
      });
    });
  }

  private async nameTaken(spaceId: string, name: string): Promise<boolean> {
    const found = await this.tenant.db.label.findFirst({
      where: { spaceId, name: { equals: name, mode: 'insensitive' } },
    });
    return found !== null;
  }
}

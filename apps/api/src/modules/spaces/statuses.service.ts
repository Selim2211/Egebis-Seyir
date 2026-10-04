import { Injectable } from '@nestjs/common';
import type { UpdateStatusRequest } from '@scrum/shared';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { notFound } from './space-errors';

/** Space durumları (Faz 5.2 WIP limiti; Faz 5.3 özel durum akışı). */
@Injectable()
export class StatusesService {
  constructor(private readonly tenant: TenantPrismaService) {}

  async update(spaceId: string, statusId: string, input: UpdateStatusRequest): Promise<void> {
    const db = this.tenant.db;
    const status = await db.status.findFirst({
      where: { id: statusId, spaceId, space: { deletedAt: null } },
      select: { id: true },
    });
    if (!status) throw notFound();
    await db.status.update({
      where: { id: statusId },
      data: { ...(input.wipLimit !== undefined && { wipLimit: input.wipLimit }) },
    });
  }
}

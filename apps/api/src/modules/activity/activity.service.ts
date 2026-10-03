import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';

/** Herhangi bir istemci veya transaction; kayıt değişiklikle aynı transaction'da yazılır. */
interface Db {
  activityEvent: {
    create(args: { data: Prisma.ActivityEventUncheckedCreateInput }): Promise<unknown>;
  };
}

export interface ActivityInput {
  workspaceId: string;
  actorId: string | null;
  entityType:
    | 'workspace'
    | 'member'
    | 'invitation'
    | 'space'
    | 'folder'
    | 'list'
    | 'item'
    | 'label'
    | 'sprint'
    | 'doc';
  entityId: string;
  action: string;
  changes?: Prisma.InputJsonValue;
}

/** Append-only değişiklik kaydı (ADR-015). Güncelleme ve silme yoktur. */
@Injectable()
export class ActivityService {
  async record(db: Db, input: ActivityInput): Promise<void> {
    await db.activityEvent.create({ data: input });
  }
}

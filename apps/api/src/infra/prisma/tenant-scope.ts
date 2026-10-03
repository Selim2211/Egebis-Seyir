/**
 * Workspace veri izolasyonu (ADR-012): kiracı modellerine yapılan her sorguya
 * workspaceId koşulu eklenir, oluşturulan kayda workspaceId yazılır.
 * Yeni bir workspace modeli eklendiğinde bu listeye de eklenmelidir.
 */
export const TENANT_MODELS: ReadonlySet<string> = new Set([
  'Role',
  'Membership',
  'Invitation',
  'ActivityEvent',
  'Space',
  'SpaceKey',
  'SpaceMember',
  'Status',
  'Folder',
  'List',
  'Favorite',
  'WorkItem',
  'WorkItemAssignee',
  'WorkItemLabel',
  'Label',
  'Checklist',
  'ChecklistItem',
  'WorkItemLink',
  'WorkItemWatcher',
  'Comment',
  'CommentMention',
  'CommentReaction',
  'Attachment',
  'Sprint',
  'Notification',
  'NotificationPreference',
  'SprintItemEvent',
  'SprintSnapshot',
  'Doc',
  'DocVersion',
  'DocItemLink',
  'RetroItem',
  'RetroVote',
  'TimeEntry',
  'ActiveTimer',
  'DashboardLayout',
]);

const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert',
]);

export class TenantScopeError extends Error {}

type Args = Record<string, unknown> | undefined;

function withWorkspace(data: unknown, workspaceId: string): unknown {
  if (typeof data !== 'object' || data === null) return data;
  const record = data as Record<string, unknown>;
  if ('workspaceId' in record && record.workspaceId !== workspaceId) {
    throw new TenantScopeError('Başka bir workspace adına kayıt oluşturulamaz');
  }
  return { ...record, workspaceId };
}

/** Saf fonksiyon: Prisma sorgu argümanlarını workspace kapsamına alır. */
export function scopeArgs(model: string, operation: string, args: Args, workspaceId: string): Args {
  if (!TENANT_MODELS.has(model)) return args;
  const next: Record<string, unknown> = { ...(args ?? {}) };

  if (WHERE_OPERATIONS.has(operation)) {
    next.where = { ...(next.where ?? {}), workspaceId };
  }
  if (operation === 'create' || operation === 'upsert') {
    const key = operation === 'create' ? 'data' : 'create';
    next[key] = withWorkspace(next[key], workspaceId);
  }
  if (operation === 'createMany' || operation === 'createManyAndReturn') {
    const data = next.data;
    next.data = Array.isArray(data)
      ? data.map((d) => withWorkspace(d, workspaceId))
      : withWorkspace(data, workspaceId);
  }
  return next;
}

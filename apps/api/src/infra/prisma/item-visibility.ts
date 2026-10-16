import type { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../cls/request-context';
import type { PrismaService } from './prisma.service';

/**
 * Öğe gizliliği (ADR-113): kullanıcının göremediği "gizli erişim kökleri".
 * Kök = `WorkItemAccess` kaydı olan ve `isPrivate` olan öğe; alt ağacındaki her öğenin
 * `accessRootId` değeri bu köke eşittir. Owner/Admin hiçbir şeyi kaçırmaz; kökü oluşturan ve
 * listedeki kişi/takım üyeleri görür. İstek başına bir kez hesaplanır (CLS önbelleği).
 * Ham istemci kullanılır: tenant istemcisi bu fonksiyonu çağırdığı için özyineleme olmasın.
 */
export async function loadHiddenRoots(
  prisma: PrismaService,
  cls: ClsService<AppClsStore>,
): Promise<readonly string[]> {
  const cached = cls.get('hiddenRoots');
  if (cached) return cached;

  const userId = cls.get('userId');
  const workspaceId = cls.get('workspaceId');
  const tier = cls.get('workspaceRole');
  // Arka plan işleri (kullanıcısız) ve Owner/Admin: süzme yok.
  if (!userId || !workspaceId || tier === 'OWNER' || tier === 'ADMIN') {
    cls.set('hiddenRoots', []);
    return [];
  }

  const roots = await prisma.workItemAccess.findMany({
    where: { workspaceId, isPrivate: true },
    select: {
      itemId: true,
      createdById: true,
      entries: { select: { userId: true, teamId: true } },
    },
  });
  if (roots.length === 0) {
    cls.set('hiddenRoots', []);
    return [];
  }
  const teams = new Set(
    (
      await prisma.teamMember.findMany({ where: { userId, workspaceId }, select: { teamId: true } })
    ).map((t) => t.teamId),
  );
  const hidden = roots
    .filter(
      (r) =>
        r.createdById !== userId &&
        !r.entries.some((e) => e.userId === userId || (e.teamId !== null && teams.has(e.teamId))),
    )
    .map((r) => r.itemId);
  cls.set('hiddenRoots', hidden);
  return hidden;
}

/** Hiçbir istekte yeniden hesaplanmasın diye değişiklikten sonra önbelleği düşürür. */
export function resetHiddenRoots(cls: ClsService<AppClsStore>): void {
  cls.set('hiddenRoots', undefined);
}

const FILTERED_OPERATIONS = new Set([
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
]);

/** WorkItem sorgusuna "gizli köklerin altında değil" koşulunu ekler. Saf fonksiyon. */
export function hideItemsArgs(
  operation: string,
  args: Record<string, unknown> | undefined,
  hidden: readonly string[],
): Record<string, unknown> | undefined {
  if (hidden.length === 0 || !FILTERED_OPERATIONS.has(operation)) return args;
  const next: Record<string, unknown> = { ...(args ?? {}) };
  const where = (next.where ?? {}) as Record<string, unknown>;
  const existing: unknown[] =
    where.AND === undefined
      ? []
      : Array.isArray(where.AND)
        ? (where.AND as unknown[])
        : [where.AND];
  next.where = {
    ...where,
    AND: [...existing, { OR: [{ accessRootId: null }, { accessRootId: { notIn: [...hidden] } }] }],
  };
  return next;
}

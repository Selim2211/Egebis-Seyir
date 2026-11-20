import type { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { notFound } from '../spaces/space-errors';

/** Proje bağlamının modele giden metin sınırı (karakter). */
export const MAX_PROJECT_CHARS = 14_000;
/** Bağlama girecek son tamamlanmış sprint sayısı. */
export const PAST_SPRINTS = 6;
const PAST_ITEMS_PER_SPRINT = 12;
const EPICS = 20;
const TARGET_ITEMS = 60;
const BACKLOG_ITEMS = 40;
const CALIBRATION_ITEMS = 30;

type Db = TenantPrismaService['db'];

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '?');
const pts = (p: number | null | undefined) => (p == null ? 'unestimated' : `${p} SP`);

export interface ProjectContextOptions {
  /** Hedef sprint: işleri ayrıca listelenir. Yoksa (yeni sprint) Backlog'un üstü listelenir. */
  sprintId?: string | null;
  /** Kaydedilmemiş sprint'in adı ve hedefi (pencere açıkken). */
  draft?: { name?: string; goal?: string };
  /** Story Point tahmini için ekibin puanladığı ve bitirdiği örnek işler. */
  calibration?: boolean;
  /** Tahmin edilen işin kendisi örneklerde yer almasın. */
  excludeItemId?: string;
}

/**
 * Yapay zekânın "projeyi öğrenmesi" için bağlam (ADR-175): proje açıklaması ve DoD, açık Epic'ler,
 * son tamamlanan sprint'lerin hedefi ve gerçekte bitenler, aktif sprint, hedef sprint'in işleri ya da
 * Backlog'un üstü, isteğe bağlı olarak puanlanmış örnek işler. Tenant istemcisi kullanıldığı için
 * kullanıcının göremediği işler (ADR-113) bağlama girmez.
 */
export async function buildProjectContext(
  db: Db,
  spaceId: string,
  options: ProjectContextOptions = {},
): Promise<string> {
  const space = await db.space.findFirst({
    where: { id: spaceId, deletedAt: null },
    select: { name: true, key: true, description: true, dodItems: true },
  });
  if (!space) throw notFound();

  const target = options.sprintId
    ? await db.sprint.findFirst({
        where: { id: options.sprintId },
        select: {
          id: true,
          spaceId: true,
          name: true,
          goal: true,
          status: true,
          startDate: true,
          endDate: true,
        },
      })
    : null;
  // Başka Projenin sprint'i bu Projenin bağlamına karışmaz.
  if (options.sprintId && (!target || target.spaceId !== spaceId)) throw notFound();

  const [epics, past, active] = await Promise.all([
    db.workItem.findMany({
      where: { spaceId, type: 'EPIC', deletedAt: null, archivedAt: null },
      orderBy: { rank: 'asc' },
      take: EPICS,
      select: { keyPrefix: true, number: true, title: true, status: { select: { name: true } } },
    }),
    db.sprint.findMany({
      where: { spaceId, status: 'COMPLETED', ...(target && { id: { not: target.id } }) },
      orderBy: { completedAt: 'desc' },
      take: PAST_SPRINTS,
      select: {
        id: true,
        name: true,
        goal: true,
        startDate: true,
        endDate: true,
        committedPoints: true,
        completedPoints: true,
      },
    }),
    db.sprint.findFirst({
      where: { spaceId, status: 'ACTIVE', ...(target && { id: { not: target.id } }) },
      select: { id: true, name: true, goal: true, startDate: true, endDate: true },
    }),
  ]);

  const pastIds = past.map((s) => s.id);
  const [pastItems, activeItems, targetItems] = await Promise.all([
    pastIds.length
      ? db.workItem.findMany({
          where: { sprintId: { in: pastIds }, deletedAt: null, type: { not: 'SUBTASK' } },
          orderBy: { rank: 'asc' },
          take: PAST_SPRINTS * PAST_ITEMS_PER_SPRINT * 2,
          select: {
            sprintId: true,
            type: true,
            title: true,
            points: true,
            status: { select: { category: true } },
          },
        })
      : [],
    active
      ? db.workItem.findMany({
          where: { sprintId: active.id, deletedAt: null, type: { not: 'SUBTASK' } },
          orderBy: { rank: 'asc' },
          take: 25,
          select: { type: true, title: true, status: { select: { name: true } } },
        })
      : [],
    db.workItem.findMany({
      where: target
        ? { sprintId: target.id, deletedAt: null, type: { not: 'SUBTASK' } }
        : {
            spaceId,
            sprintId: null,
            deletedAt: null,
            archivedAt: null,
            type: { in: ['TASK', 'BUG'] },
            status: { category: { not: 'DONE' } },
          },
      orderBy: { rank: 'asc' },
      take: target ? TARGET_ITEMS : BACKLOG_ITEMS,
      select: {
        keyPrefix: true,
        number: true,
        type: true,
        title: true,
        points: true,
        priority: true,
        status: { select: { name: true } },
        parent: { select: { title: true } },
      },
    }),
  ]);

  const calibration = options.calibration
    ? await db.workItem.findMany({
        where: {
          spaceId,
          deletedAt: null,
          points: { not: null },
          completedAt: { not: null },
          type: { in: ['TASK', 'BUG', 'SUBTASK'] },
          ...(options.excludeItemId && { id: { not: options.excludeItemId } }),
        },
        orderBy: { completedAt: 'desc' },
        take: CALIBRATION_ITEMS,
        select: { type: true, title: true, points: true },
      })
    : [];

  const parts: string[] = [];
  parts.push(
    [
      `Project: ${space.name} (key ${space.key})`,
      space.description
        ? `Project description:\n${space.description}`
        : 'Project description: (none)',
      space.dodItems.length
        ? `Definition of Done:\n${space.dodItems.map((d) => `- ${d}`).join('\n')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n'),
  );
  if (epics.length) {
    parts.push(
      `Epics (big themes of the project):\n${epics
        .map((e) => `- ${e.keyPrefix}-${e.number} ${e.title} [${e.status.name}]`)
        .join('\n')}`,
    );
  }
  if (past.length) {
    const lines = past.map((s) => {
      const items = pastItems.filter((i) => i.sprintId === s.id);
      const done = items
        .filter((i) => i.status.category === 'DONE')
        .slice(0, PAST_ITEMS_PER_SPRINT);
      const notDone = items.length - items.filter((i) => i.status.category === 'DONE').length;
      return [
        `* ${s.name} (${day(s.startDate)} → ${day(s.endDate)}), committed ${s.committedPoints ?? '?'} SP, completed ${s.completedPoints ?? '?'} SP`,
        `  Goal: ${s.goal?.trim() || '(no goal)'}`,
        done.length
          ? `  Delivered:\n${done.map((i) => `   - (${i.type}) ${i.title} — ${pts(i.points)}`).join('\n')}`
          : '  Delivered: (nothing recorded)',
        notDone > 0 ? `  Not finished: ${notDone} item(s)` : null,
      ]
        .filter(Boolean)
        .join('\n');
    });
    parts.push(`Recently completed sprints (newest first):\n${lines.join('\n')}`);
  } else {
    parts.push('Recently completed sprints: none yet.');
  }
  if (active) {
    parts.push(
      [
        `Currently active sprint: ${active.name} (${day(active.startDate)} → ${day(active.endDate)})`,
        `  Goal: ${active.goal?.trim() || '(no goal)'}`,
        activeItems.length
          ? `  Items:\n${activeItems.map((i) => `   - (${i.type}) ${i.title} [${i.status.name}]`).join('\n')}`
          : null,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  const name = options.draft?.name?.trim() || target?.name;
  const goal = options.draft?.goal?.trim() ?? target?.goal?.trim();
  const itemLines = targetItems.map(
    (i) =>
      `   - ${i.keyPrefix}-${i.number} (${i.type}, ${i.priority}) ${i.title} — ${pts(i.points)} [${i.status.name}]` +
      (i.parent ? ` · epic/parent: ${i.parent.title}` : ''),
  );
  parts.push(
    target
      ? [
          `TARGET sprint: ${name ?? target.name} (${day(target.startDate)} → ${day(target.endDate)}, ${target.status})`,
          goal ? `  Current goal text: ${goal}` : null,
          itemLines.length
            ? `  Items planned in this sprint:\n${itemLines.join('\n')}`
            : '  Items planned in this sprint: none yet.',
        ]
          .filter(Boolean)
          .join('\n')
      : [
          `TARGET sprint: a new sprint${name ? ` named "${name}"` : ''} (not created yet, no items planned yet).`,
          itemLines.length
            ? `  Top of the backlog (most likely candidates, highest rank first):\n${itemLines.join('\n')}`
            : '  Backlog: empty.',
        ].join('\n'),
  );
  if (calibration.length) {
    parts.push(
      `Team's past estimates (completed items and the Story Points they were given):\n${calibration
        .map((i) => `- (${i.type}) ${i.title} — ${pts(i.points)}`)
        .join('\n')}`,
    );
  }
  return parts.join('\n\n').slice(0, MAX_PROJECT_CHARS);
}

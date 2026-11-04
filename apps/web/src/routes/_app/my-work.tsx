import { listName } from '@/lib/default-names';
import { statusName } from '@/lib/default-names';
import { MY_WORK_SCOPES, type MyWorkScope, type WorkItemRow } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Inbox } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { PageHeading } from '@/components/layout/page-heading';
import {
  PriorityIcon,
  StatusBadge,
  WorkItemTypeIcon,
} from '@/components/work-item/work-item-visuals';
import { ItemOpenLink } from '@/features/work-items/detail/item-nav';
import { ItemNavContext } from '@/features/work-items/detail/item-nav-context';
import { hierarchyQuery } from '@/features/spaces/queries';
import { mySprintWorkQuery, myWorkQuery } from '@/features/work-items/queries';
import { AssigneeStack, DueCell } from '@/features/work-items/view/cells';
import { SpaceAvatar } from '@/features/spaces/space-avatar';
import { type DueBucket, dueBucket } from '@/features/work-items/view/view-state';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { todayDay } from '@/lib/format';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/my-work')({
  validateSearch: z.object({
    scope: z.enum(MY_WORK_SCOPES).optional(),
    done: z.boolean().optional(),
    /** Bana atananlar → seçili Proje: sprint gruplu görünüm (ADR-163). */
    space: z.uuid().optional(),
  }),
  component: MyWorkPage,
});

const BUCKETS: DueBucket[] = ['overdue', 'today', 'week', 'later', 'none'];

/** Bana atananlar / Oluşturduklarım / İzlediklerim (brief §5.8, ADR-054). */
function MyWorkPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: workspaceId } = useCurrentWorkspace();
  const { scope = 'assigned', done = false, space } = Route.useSearch();
  const projectView = scope === 'assigned' && !!space;
  const { data, isPending } = useQuery({
    ...myWorkQuery(workspaceId, scope, done),
    enabled: !projectView,
  });
  const today = todayDay();

  const groups = BUCKETS.map((bucket) => ({
    bucket,
    items: (data?.items ?? []).filter(
      (item) => dueBucket(item, item.status.category, today) === bucket,
    ),
  })).filter((g) => g.items.length > 0);

  return (
    <ItemNavContext.Provider value={(key) => void navigate({ to: '/items/$key', params: { key } })}>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <PageHeading title={t('myWork.title')} subtitle={t('myWork.subtitle')} />

        <div className="mb-4 flex flex-wrap items-center gap-2 border-b">
          <div role="tablist" aria-label={t('myWork.title')} className="-mb-px flex gap-1">
            {MY_WORK_SCOPES.map((key) => (
              <Link
                key={key}
                to="/my-work"
                search={{ scope: key === 'assigned' ? undefined : key, done: done || undefined }}
                replace
                role="tab"
                aria-selected={scope === key}
                className={cn(
                  'flex h-9 items-center border-b-2 px-3 text-sm',
                  scope === key
                    ? 'border-primary text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground border-transparent',
                )}
              >
                {t(`myWork.scope.${key}`)}
              </Link>
            ))}
          </div>
          <label className="ml-auto flex items-center gap-2 pb-1 text-sm">
            <input
              type="checkbox"
              checked={done}
              className="accent-primary size-4"
              onChange={(e) =>
                void navigate({
                  to: '/my-work',
                  replace: true,
                  search: {
                    scope: scope === 'assigned' ? undefined : (scope as MyWorkScope),
                    done: e.target.checked || undefined,
                  },
                })
              }
            />
            {t('myWork.showDone')}
          </label>
        </div>

        {scope === 'assigned' && <ProjectChips current={space ?? null} done={done} />}

        {projectView ? (
          <SprintGroups spaceId={space} />
        ) : isPending ? (
          <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Inbox className="text-muted-foreground size-8" aria-hidden />
            <p className="text-sm">{t(`myWork.empty.${scope}`)}</p>
          </div>
        ) : (
          groups.map(({ bucket, items }) => (
            <section key={bucket} className="mb-5" aria-labelledby={`mw-${bucket}`}>
              <h2
                id={`mw-${bucket}`}
                className={cn(
                  'mb-1 text-xs font-semibold tracking-wide uppercase',
                  bucket === 'overdue' ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {t(`groups.due.${bucket}`)} <span className="font-normal">{items.length}</span>
              </h2>
              <ul className="bg-card divide-y rounded-lg border">
                {items.map((item) => (
                  <Row key={item.id} item={item} overdue={bucket === 'overdue'} />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </ItemNavContext.Provider>
  );
}

/** Bana atananlar → Proje seçimi: "Tümü" tarih gruplarını, bir Proje son sprint'lerini gösterir. */
function ProjectChips({ current, done }: { current: string | null; done: boolean }) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const spaces = (useQuery(hierarchyQuery(workspaceId)).data?.spaces ?? []).filter(
    (s) => s.scrumEnabled,
  );
  if (spaces.length === 0) return null;
  const chip = (active: boolean) =>
    cn(
      'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
      active
        ? 'border-primary bg-primary/10 text-primary font-medium'
        : 'text-muted-foreground hover:text-foreground hover:border-primary/40',
    );
  return (
    <nav
      aria-label={t('myWork.projects')}
      className="mb-4 flex gap-2 overflow-x-auto pb-1"
      data-testid="mywork-projects"
    >
      <Link
        to="/my-work"
        search={{ done: done || undefined }}
        replace
        aria-current={current === null ? 'page' : undefined}
        className={chip(current === null)}
      >
        {t('myWork.allProjects')}
      </Link>
      {spaces.map((s) => (
        <Link
          key={s.id}
          to="/my-work"
          search={{ space: s.id, done: done || undefined }}
          replace
          aria-current={current === s.id ? 'page' : undefined}
          className={chip(current === s.id)}
        >
          <SpaceAvatar space={{ ...s, icon: null }} size={16} />
          {s.name}
        </Link>
      ))}
    </nav>
  );
}

/** Seçili Projenin son sprint'leri ve her birinde bana atanan işler (ADR-163). */
function SprintGroups({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const { data, isPending } = useQuery(mySprintWorkQuery(workspaceId, spaceId));
  const today = todayDay();
  if (isPending) return <p className="text-muted-foreground text-sm">{t('common.loading')}</p>;
  const sprints = data?.sprints ?? [];
  if (sprints.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <Inbox className="text-muted-foreground size-8" aria-hidden />
        <p className="text-sm">{t('myWork.noSprints')}</p>
      </div>
    );
  }
  return sprints.map((sprint) => {
    const done = sprint.items.filter((i) => i.status.category === 'DONE').length;
    return (
      <section
        key={sprint.id}
        className="mb-5"
        aria-labelledby={`mws-${sprint.id}`}
        data-testid="mywork-sprint"
      >
        <h2
          id={`mws-${sprint.id}`}
          className="mb-1 flex flex-wrap items-center gap-2 text-sm font-semibold"
        >
          <Link
            to="/spaces/$spaceId/board"
            params={{ spaceId }}
            search={{ sprint: sprint.id }}
            className="hover:underline"
          >
            {sprint.name}
          </Link>
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-medium',
              sprint.status === 'ACTIVE'
                ? 'bg-primary/15 text-primary'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {t(`myWork.sprintStatus.${sprint.status}`)}
          </span>
          <span className="text-muted-foreground text-xs font-normal">
            {sprint.startDate} – {sprint.endDate} ·{' '}
            {t('myWork.sprintDone', { done, total: sprint.items.length })}
          </span>
        </h2>
        {sprint.items.length === 0 ? (
          <p className="text-muted-foreground bg-card rounded-lg border px-3 py-3 text-sm">
            {t('myWork.sprintEmpty')}
          </p>
        ) : (
          <ul className="bg-card divide-y rounded-lg border">
            {sprint.items.map((item) => (
              <Row
                key={item.id}
                item={item}
                overdue={dueBucket(item, item.status.category, today) === 'overdue'}
              />
            ))}
          </ul>
        )}
      </section>
    );
  });
}

function Row({ item, overdue }: { item: WorkItemRow; overdue: boolean }) {
  const done = item.status.category === 'DONE';
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 md:flex-nowrap">
      <div className="flex min-w-0 flex-1 basis-full items-center gap-2 md:basis-auto">
        <WorkItemTypeIcon type={item.type} />
        <span className="text-muted-foreground shrink-0 font-mono text-xs">{item.key}</span>
        <ItemOpenLink
          itemKey={item.key}
          className={cn(
            'truncate text-sm hover:underline',
            done && 'text-muted-foreground line-through',
          )}
        >
          {item.title}
        </ItemOpenLink>
      </div>
      <Link
        to="/lists/$listId"
        params={{ listId: item.list.id }}
        className="text-muted-foreground hover:text-foreground flex w-44 shrink-0 items-center gap-1.5 truncate text-xs"
      >
        <SpaceAvatar space={{ ...item.space, icon: null }} size={16} />
        <span className="truncate">
          {item.space.name} › {listName(item.list.name)}
        </span>
      </Link>
      <div className="w-32 shrink-0">
        <StatusBadge
          category={item.status.category}
          label={statusName(item.status.name)}
          color={item.status.color}
        />
      </div>
      <PriorityIcon priority={item.priority} />
      <div className="w-16 shrink-0">
        <DueCell item={item} overdue={overdue} />
      </div>
      <div className="w-20 shrink-0">
        <AssigneeStack item={item} />
      </div>
    </li>
  );
}

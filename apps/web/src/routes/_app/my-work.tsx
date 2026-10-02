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
import { myWorkQuery } from '@/features/work-items/queries';
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
  }),
  component: MyWorkPage,
});

const BUCKETS: DueBucket[] = ['overdue', 'today', 'week', 'later', 'none'];

/** Bana atananlar / Oluşturduklarım / İzlediklerim (brief §5.8, ADR-054). */
function MyWorkPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: workspaceId } = useCurrentWorkspace();
  const { scope = 'assigned', done = false } = Route.useSearch();
  const { data, isPending } = useQuery(myWorkQuery(workspaceId, scope, done));
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
                    ? 'border-primary font-semibold'
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

        {isPending ? (
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
          {item.space.name} › {item.list.name}
        </span>
      </Link>
      <div className="w-32 shrink-0">
        <StatusBadge
          category={item.status.category}
          label={item.status.name}
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

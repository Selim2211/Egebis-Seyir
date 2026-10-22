import { useQuery } from '@tanstack/react-query';
import { SPACE_PERMISSIONS as S, type TreeSpace } from '@scrum/shared';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormError, SelectField } from '@/components/form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useHierarchy } from '@/features/spaces/queries';
import { useMoveItem } from '@/features/work-items/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { cn } from '@/lib/utils';
import type { BulkItem } from './bulk-utils';
import { sprintsQuery, useMoveToSprint } from './queries';

/** Sprint listesinin her seferinde gösterdiği sayı: aşağı indikçe devam eder (yüzlerce sprint olabilir). */
const PAGE = 12;
const BACKLOG = '__backlog';
/** Özet kutusunda en çok bu kadar öğe tek tek yazılır. */
const SUMMARY_MAX = 6;

/** Bir Proje'nin yeni öğe alabilen ilk List'i (klasörsüz listeler önce). */
const firstListId = (space: TreeSpace) =>
  space.lists[0]?.id ?? space.folders.flatMap((f) => f.lists)[0]?.id;

/**
 * Seçili öğeleri herhangi bir Proje'nin sprint'ine (ya da Backlog'a) taşıma: Proje seçimi (varsayılan bu Proje),
 * ada göre aranabilen ve aşağı indikçe devam eden sprint listesi, hangi öğenin nereye gideceğini gösteren özet
 * ve onay. Aynı Proje'de taşıma `onSameProject` ile yapılır (aktif sprint onayı sayfada); başka Proje'ye önce
 * öğeler taşınır, sonra sprint atanır.
 */
export function MoveSelectedDialog({
  items,
  currentSpaceId,
  open,
  onOpenChange,
  onSameProject,
  onDone,
}: {
  items: BulkItem[];
  currentSpaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSameProject: (sprintId: string | null) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" closeLabel={t('common.close')}>
        {open && (
          <MoveForm
            items={items}
            currentSpaceId={currentSpaceId}
            onClose={() => onOpenChange(false)}
            onSameProject={onSameProject}
            onDone={onDone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MoveForm({
  items,
  currentSpaceId,
  onClose,
  onSameProject,
  onDone,
}: {
  items: BulkItem[];
  currentSpaceId: string;
  onClose: () => void;
  onSameProject: (sprintId: string | null) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const hierarchy = useHierarchy();
  const moveItem = useMoveItem();
  const moveToSprint = useMoveToSprint();
  const [spaceId, setSpaceId] = useState(currentSpaceId);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  // Sprint planlayabildiğin Scrum Proje'leri (ve kendi Proje'n).
  const spaces = (hierarchy.data?.spaces ?? []).filter(
    (s) =>
      s.id === currentSpaceId ||
      (s.scrumEnabled &&
        s.permissions.includes(S.WORK_ITEM_WRITE) &&
        s.permissions.includes(S.SPRINT_PLAN) &&
        firstListId(s)),
  );
  const space = spaces.find((s) => s.id === spaceId);
  const sprints = useQuery(sprintsQuery(workspaceId, spaceId));
  const open = (sprints.data?.sprints ?? [])
    .filter((s) => s.status === 'PLANNED' || s.status === 'ACTIVE')
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const q = query.trim().toLocaleLowerCase();
  const matching = q ? open.filter((s) => s.name.toLocaleLowerCase().includes(q)) : open;
  const shown = matching.slice(0, limit);
  const showBacklog = !q || t('moveItem.backlog').toLocaleLowerCase().includes(q);

  const targetName =
    target === null
      ? ''
      : target === BACKLOG
        ? t('moveItem.backlog')
        : (open.find((s) => s.id === target)?.name ?? '');
  const crossSpace = spaceId !== currentSpaceId;
  const lines = items.slice(0, SUMMARY_MAX);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (target === null || !space) return;
    setError(null);
    const sprintId = target === BACKLOG ? null : target;
    if (!crossSpace) {
      onSameProject(sprintId);
      onDone();
      onClose();
      return;
    }
    const listId = firstListId(space);
    if (!listId) return;
    setBusy(true);
    try {
      for (const item of items) await moveItem.mutateAsync({ itemId: item.id, body: { listId } });
      if (sprintId) {
        await moveToSprint.mutateAsync({
          spaceId: space.id,
          body: { itemIds: items.map((i) => i.id), sprintId },
        });
      }
      toast.success(
        t('moveSelected.done', {
          count: items.length,
          target: `${space.name} · ${targetName}`,
        }),
      );
      onDone();
      onClose();
    } catch (err) {
      setError(err);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const option = (id: string, label: string, hint?: string) => (
    <button
      key={id}
      type="button"
      role="option"
      aria-selected={target === id}
      onClick={() => setTarget(id)}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm',
        target === id ? 'bg-primary/10 ring-primary/40 ring-1' : 'hover:bg-accent',
      )}
    >
      <span className="truncate">{label}</span>
      {hint && <span className="text-muted-foreground shrink-0 text-xs">{hint}</span>}
    </button>
  );

  return (
    <form onSubmit={(e) => void submit(e)}>
      <DialogHeader>
        <DialogTitle>{t('moveSelected.title', { count: items.length })}</DialogTitle>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        <SelectField
          label={t('moveItem.project')}
          value={spaceId}
          onChange={(e) => {
            setSpaceId(e.target.value);
            setTarget(null);
            setQuery('');
            setLimit(PAGE);
          }}
        >
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>

        <div className="flex flex-col gap-1.5">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder={t('moveSelected.search')}
            aria-label={t('moveSelected.search')}
          />
          <div
            role="listbox"
            aria-label={t('moveSelected.sprints')}
            data-testid="sprint-list"
            className="max-h-56 overflow-y-auto rounded-lg border p-1"
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
                setLimit((l) => (l < matching.length ? l + PAGE : l));
              }
            }}
          >
            {showBacklog && option(BACKLOG, t('moveItem.backlog'))}
            {shown.map((s) =>
              option(
                s.id,
                s.name,
                s.status === 'ACTIVE' ? t('moveSelected.active') : `${s.startDate} → ${s.endDate}`,
              ),
            )}
            {sprints.isPending && (
              <p className="text-muted-foreground px-3 py-2 text-sm">{t('common.loading')}</p>
            )}
            {!sprints.isPending && matching.length === 0 && !showBacklog && (
              <p className="text-muted-foreground px-3 py-2 text-sm">{t('moveSelected.none')}</p>
            )}
            {shown.length < matching.length && (
              <p className="text-muted-foreground px-3 py-1.5 text-center text-xs">
                {t('moveSelected.more', { shown: shown.length, total: matching.length })}
              </p>
            )}
          </div>
        </div>

        {target !== null && (
          <div className="bg-muted rounded-lg px-3 py-2.5 text-sm" data-testid="move-summary">
            <p className="mb-1 font-medium">
              {t('moveSelected.summary', {
                count: items.length,
                target: crossSpace ? `${space?.name ?? ''} · ${targetName}` : targetName,
              })}
            </p>
            <ul className="text-muted-foreground space-y-0.5 text-xs">
              {lines.map((i) => (
                <li key={i.id} className="truncate">
                  <span className="font-mono">{i.key}</span> {i.title}
                </li>
              ))}
              {items.length > lines.length && (
                <li>{t('moveSelected.andMore', { count: items.length - lines.length })}</li>
              )}
            </ul>
            {crossSpace && (
              <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
                {t('moveSelected.crossNote')}
              </p>
            )}
          </div>
        )}
        <FormError error={error} />
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={busy || target === null}>
          {t('moveSelected.confirm')}
        </Button>
      </DialogFooter>
    </form>
  );
}

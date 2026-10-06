import { type Goal } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Plus, Target, Trash2, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormError, NativeSelect } from '@/components/form';
import { PageHeading } from '@/components/layout/page-heading';
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
import { WorkItemTypeIcon } from '@/components/work-item/work-item-visuals';
import { globalSearchQuery } from '@/features/work-items/queries';
import { useCurrentWorkspace, useMembers } from '@/features/workspace/queries';
import { formatShortDate } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';
import { useCreateGoal, useDeleteGoal, useGoals, useLinkGoalItem, useUpdateGoal } from './queries';

const COLORS = ['#7C3AED', '#2563EB', '#059669', '#D97706', '#DC2626', '#DB2777'];

/** Hedefler (Faz 7.9, ADR-097): görev bazlı ve sayısal hedefler, ilerleme çubuğuyla. */
export function GoalsPage() {
  const { t } = useTranslation();
  const { data, isPending } = useGoals();
  const [creating, setCreating] = useState(false);
  const goals = data?.goals ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <PageHeading title={t('goals.title')} subtitle={t('goals.subtitle')} />
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus />
          {t('goals.add')}
        </Button>
      </div>

      {isPending ? (
        <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
      ) : goals.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed px-4 py-10 text-center text-sm">
          {t('goals.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </ul>
      )}
      {creating && <CreateGoalDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function GoalCard({ goal }: { goal: Goal }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const update = useUpdateGoal();
  const remove = useDeleteGoal();
  const link = useLinkGoalItem();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);

  const saveCurrent = () => {
    if (current === null) return;
    const value = Number(current.replace(',', '.'));
    setCurrent(null);
    if (Number.isFinite(value) && value !== goal.currentValue) {
      update.mutate(
        { goalId: goal.id, body: { currentValue: value } },
        { onError: (error) => toast.error(errorMessage(error)) },
      );
    }
  };

  return (
    <li className="bg-card rounded-lg border p-4">
      <div className="flex items-center gap-3">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-white"
          style={{ backgroundColor: goal.color }}
          aria-hidden
        >
          <Target className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            className="truncate text-left font-medium hover:underline"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {goal.name}
          </button>
          <p className="text-muted-foreground text-xs">
            {[
              goal.owner?.name,
              goal.dueDate && t('goals.due', { date: formatShortDate(goal.dueDate) }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <span className="text-sm font-semibold tabular-nums">{goal.percent}%</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('goals.delete', { name: goal.name })}
          onClick={() => setDeleting(true)}
        >
          <Trash2 />
        </Button>
      </div>
      <div
        role="progressbar"
        aria-label={goal.name}
        aria-valuenow={goal.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="bg-muted mt-3 h-2 overflow-hidden rounded-full"
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${goal.percent}%`, backgroundColor: goal.color }}
        />
      </div>

      {goal.kind === 'NUMBER' && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t('goals.current')}</span>
          <Input
            className="h-8 w-28"
            inputMode="decimal"
            aria-label={t('goals.currentFor', { name: goal.name })}
            value={current ?? String(goal.currentValue ?? '')}
            onChange={(e) => setCurrent(e.target.value)}
            onBlur={saveCurrent}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <span className="text-muted-foreground">
            {t('goals.range', {
              start: goal.startValue,
              target: goal.targetValue,
              unit: goal.unit ?? '',
            })}
          </span>
        </div>
      )}

      {open && goal.kind === 'TASKS' && (
        <div className="mt-4 border-t pt-3">
          {goal.items.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('goals.noItems')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {goal.items.map((item) => (
                <li key={item.id} className="flex items-center gap-2 text-sm">
                  <WorkItemTypeIcon type={item.type} />
                  <Link
                    to="/items/$key"
                    params={{ key: item.key }}
                    className={item.done ? 'text-muted-foreground line-through' : 'hover:underline'}
                  >
                    <span className="text-muted-foreground mr-1.5 font-mono text-xs">
                      {item.key}
                    </span>
                    {item.title}
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto size-6"
                    aria-label={t('goals.unlink', { key: item.key })}
                    onClick={() => link.mutate({ goalId: goal.id, itemId: item.id, link: false })}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {goal.hiddenItemCount > 0 && (
            <p className="text-muted-foreground mt-2 text-xs">
              {t('goals.hidden', { count: goal.hiddenItemCount })}
            </p>
          )}
          <AddItem goal={goal} />
        </div>
      )}

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('goals.deleteTitle', { name: goal.name })}
        description={t('goals.deleteBody')}
        confirmLabel={t('goals.deleteConfirm')}
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(goal.id, {
            onSuccess: () => setDeleting(false),
            onError: (error) => toast.error(errorMessage(error)),
          })
        }
      />
    </li>
  );
}

/** Aramayla görev bulup hedefe bağlar. */
function AddItem({ goal }: { goal: Goal }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const link = useLinkGoalItem();
  const [text, setText] = useState('');
  const { data } = useQuery(globalSearchQuery(workspaceId, text.trim()));
  const linked = new Set(goal.items.map((i) => i.id));
  const results = (data?.items ?? []).filter((i) => !linked.has(i.id)).slice(0, 6);

  return (
    <div className="mt-3">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('goals.addItemPlaceholder')}
        aria-label={t('goals.addItem', { name: goal.name })}
        className="h-8"
      />
      {text.trim() !== '' && results.length > 0 && (
        <ul className="mt-1 rounded-md border">
          {results.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="hover:bg-accent flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm"
                onClick={() =>
                  link.mutate(
                    { goalId: goal.id, itemId: item.id, link: true },
                    {
                      onSuccess: () => setText(''),
                      onError: (error) => toast.error(errorMessage(error)),
                    },
                  )
                }
              >
                <WorkItemTypeIcon type={item.type} />
                <span className="text-muted-foreground font-mono text-xs">{item.key}</span>
                <span className="truncate">{item.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateGoalDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const create = useCreateGoal();
  const members = useMembers().data?.members ?? [];
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'TASKS' | 'NUMBER'>('TASKS');
  const [dueDate, setDueDate] = useState('');
  const [color, setColor] = useState(COLORS[0]!);
  const [ownerId, setOwnerId] = useState('');
  const [start, setStart] = useState('0');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');

  const num = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')));
  const valid =
    name.trim() !== '' && (kind === 'TASKS' || (!isNaN(num(start)) && !isNaN(num(target))));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    create.mutate(
      {
        name: name.trim(),
        kind,
        color,
        dueDate: dueDate || null,
        ownerId: ownerId || null,
        ...(kind === 'NUMBER' && {
          startValue: num(start),
          targetValue: num(target),
          unit: unit.trim() || null,
        }),
      },
      {
        onSuccess: () => {
          toast.success(t('goals.created'));
          onClose();
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{t('goals.addTitle')}</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t('goals.name')}
              <Input
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t('goals.kind')}
                <NativeSelect
                  value={kind}
                  onChange={(e) => setKind(e.target.value as 'TASKS' | 'NUMBER')}
                >
                  <option value="TASKS">{t('goals.kinds.TASKS')}</option>
                  <option value="NUMBER">{t('goals.kinds.NUMBER')}</option>
                </NativeSelect>
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t('goals.dueDate')}
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t('goals.owner')}
                <NativeSelect value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                  <option value="">—</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <fieldset className="flex flex-col gap-1.5">
                <legend className="text-sm font-medium">{t('goals.color')}</legend>
                <div className="flex gap-1.5 pt-1">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={c}
                      aria-pressed={color === c}
                      onClick={() => setColor(c)}
                      className="size-6 rounded-full border-2"
                      style={{
                        backgroundColor: c,
                        borderColor: color === c ? 'var(--foreground)' : 'transparent',
                      }}
                    />
                  ))}
                </div>
              </fieldset>
            </div>
            {kind === 'NUMBER' && (
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  {t('goals.start')}
                  <Input
                    value={start}
                    inputMode="decimal"
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  {t('goals.target')}
                  <Input
                    value={target}
                    inputMode="decimal"
                    onChange={(e) => setTarget(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  {t('goals.unit')}
                  <Input value={unit} maxLength={20} onChange={(e) => setUnit(e.target.value)} />
                </label>
              </div>
            )}
            {create.error && <FormError error={create.error} />}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending || !valid}>
              {t('goals.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

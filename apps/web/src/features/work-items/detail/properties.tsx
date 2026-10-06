import {
  BUG_SEVERITIES,
  ESTIMATE_KIND,
  FIBONACCI_SCALE,
  PRIORITIES,
  SPACE_COLORS,
  SPACE_PERMISSIONS as S,
  TSHIRT_POINTS,
  TSHIRT_SIZES,
  type Label,
  type Priority,
  type SpaceDetail,
  type UpdateWorkItemRequest,
  type WorkItemDetail,
} from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { Plus, Tag } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/user-avatar';
import { PriorityIcon, StatusBadge } from '@/components/work-item/work-item-visuals';
import { useMe } from '@/features/auth/queries';
import { useCurrentWorkspace, useMembers } from '@/features/workspace/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { cn } from '@/lib/utils';
import { useTeams } from '@/features/teams/queries';
import { labelsQuery, useCreateLabel } from '../queries';
import { Reminders } from './reminders';
import { useSaveItem } from './use-save-item';
import { useStatusGuard } from '../status-guard';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground pt-1">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** Puan seçimi: Space ölçeğine göre Fibonacci, T-shirt veya serbest sayı (ADR-045). */
function PointsInput({
  scale,
  value,
  disabled,
  onChange,
}: {
  scale: SpaceDetail['estimationScale'];
  value: number | null;
  disabled: boolean;
  onChange: (value: number | null) => void;
}) {
  const { t } = useTranslation();
  if (scale === 'NUMBER') {
    return (
      <input
        type="number"
        min={0}
        max={1000}
        step="any"
        defaultValue={value ?? ''}
        disabled={disabled}
        aria-label={t('detail.points')}
        onBlur={(e) => {
          const next = e.target.value === '' ? null : Number(e.target.value);
          if (next !== value) onChange(next);
        }}
        className="border-input focus-visible:ring-ring/50 h-8 w-24 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px]"
      />
    );
  }
  const options: Array<[string, number]> =
    scale === 'FIBONACCI'
      ? FIBONACCI_SCALE.map((n) => [String(n), n])
      : Object.entries(TSHIRT_POINTS).map(([size, n]) => [size, n]);
  return (
    <NativeSelect
      aria-label={t('detail.points')}
      value={value ?? ''}
      disabled={disabled}
      className="h-8"
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    >
      <option value="">{t('detail.noEstimate')}</option>
      {options.map(([label, n]) => (
        <option key={label} value={n}>
          {label}
        </option>
      ))}
    </NativeSelect>
  );
}

/** Metin alanı: odak çıkınca değiştiyse kaydeder. */
function BlurTextarea({
  label,
  value,
  disabled,
  onSave,
}: {
  label: string;
  value: string | null;
  disabled: boolean;
  onSave: (value: string | null) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-muted-foreground text-xs font-medium">
        {label}
      </label>
      <Textarea
        id={id}
        rows={2}
        defaultValue={value ?? ''}
        disabled={disabled}
        maxLength={10_000}
        onBlur={(e) => {
          const next = e.target.value.trim() || null;
          if (next !== (value ?? null)) onSave(next);
        }}
      />
    </div>
  );
}

/** Özellik paneli: durum, öncelik, atanan, tarih, tahmin, etiket ve tipe özel alanlar (brief §5.4). */
export function Properties({
  item,
  space,
  archived,
}: {
  item: WorkItemDetail;
  space: SpaceDetail;
  archived: boolean;
}) {
  const { t } = useTranslation();
  const { user } = useMe();
  const { save, update } = useSaveItem(item.id);
  const perms = space.permissions;
  const canWrite = perms.includes(S.WORK_ITEM_WRITE) && !archived;
  const canEstimate = perms.includes(S.ESTIMATE_WRITE) && !archived;
  const mine = item.reporter?.id === user.id || item.assignees.some((a) => a.id === user.id);
  const canStatus = !archived && (canWrite || (perms.includes(S.WORK_ITEM_STATUS_OWN) && mine));
  const status = space.statuses.find((s) => s.id === item.statusId);
  const kind = ESTIMATE_KIND[item.type];

  const guard = useStatusGuard(
    (itemId, statusId, force, handlers) =>
      update.mutate({ itemId, body: { statusId, ...(force && { force }) } }, handlers),
    update.isPending,
  );

  return (
    <dl className="divide-y">
      <Row label={t('items.columns.status')}>
        {canStatus && status ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('items.changeStatus', { key: item.key })}
                className="focus-visible:ring-ring/50 rounded-md outline-none focus-visible:ring-[3px]"
              >
                <StatusBadge category={status.category} label={status.name} color={status.color} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={item.statusId}
                onValueChange={(id) => guard.change(item.id, id)}
              >
                {space.statuses.map((s) => (
                  <DropdownMenuRadioItem key={s.id} value={s.id}>
                    <span className="size-2 rounded-full" style={{ background: s.color }} />
                    {s.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          status && (
            <StatusBadge category={status.category} label={status.name} color={status.color} />
          )
        )}
        {guard.dialog}
      </Row>

      <Row label={t('items.columns.priority')}>
        {canWrite ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('items.changePriority', { key: item.key })}
                className="hover:bg-accent focus-visible:ring-ring/50 flex items-center gap-1.5 rounded-md px-1.5 py-0.5 outline-none focus-visible:ring-[3px]"
              >
                <PriorityIcon priority={item.priority} />
                {t(`priority.${item.priority}`)}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={item.priority}
                onValueChange={(value) => save({ priority: value as Priority })}
              >
                {PRIORITIES.map((p) => (
                  <DropdownMenuRadioItem key={p} value={p}>
                    <PriorityIcon priority={p} />
                    {t(`priority.${p}`)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="flex items-center gap-1.5 px-1.5 py-0.5">
            <PriorityIcon priority={item.priority} />
            {t(`priority.${item.priority}`)}
          </span>
        )}
      </Row>

      <Row label={t('items.columns.assignees')}>
        <Assignees item={item} canWrite={canWrite} onSave={save} />
      </Row>

      <Row label={t('detail.startDate')}>
        <DateInput
          label={t('detail.startDate')}
          value={item.startDate}
          disabled={!canWrite}
          onChange={(startDate) => save({ startDate })}
        />
      </Row>
      <Row label={t('detail.dueDate')}>
        <DateInput
          label={t('detail.dueDate')}
          value={item.dueDate}
          min={item.startDate ?? undefined}
          disabled={!canWrite}
          onChange={(dueDate) => save({ dueDate })}
        />
      </Row>

      {item.type !== 'EPIC' && (
        <Row label={t('recurrence.label')}>
          <RecurrenceInput
            value={item.recurrence}
            disabled={!canWrite}
            needsDueDate={!item.dueDate}
            onChange={(recurrence) => save({ recurrence })}
          />
        </Row>
      )}

      <Row label={t('reminders.label')}>
        <Reminders itemId={item.id} />
      </Row>

      <Row label={t(kind === 'POINTS' ? 'detail.points' : 'detail.hours')}>
        {kind === 'POINTS' ? (
          <PointsInput
            scale={space.estimationScale}
            value={item.points}
            disabled={!canEstimate}
            onChange={(points) => save({ points })}
          />
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={10000}
              step="0.25"
              defaultValue={item.estimateHours ?? ''}
              key={item.estimateHours ?? 'none'}
              disabled={!canEstimate}
              aria-label={t('detail.hours')}
              onBlur={(e) => {
                const next = e.target.value === '' ? null : Number(e.target.value);
                if (next !== item.estimateHours) save({ estimateHours: next });
              }}
              className="border-input focus-visible:ring-ring/50 h-8 w-24 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px]"
            />
            {item.rolledUpHours != null && (
              <span className="text-muted-foreground text-xs">
                {t('detail.rolledUp', { hours: item.rolledUpHours })}
              </span>
            )}
          </div>
        )}
        {kind === 'HOURS'
          ? null
          : item.rolledUpHours != null && (
              <p className="text-muted-foreground mt-1 text-xs">
                {t('detail.rolledUp', { hours: item.rolledUpHours })}
              </p>
            )}
      </Row>

      <Row label={t('detail.labels')}>
        <LabelsPicker item={item} canWrite={canWrite} onSave={save} />
      </Row>

      <Row label={t('detail.reporter')}>
        {item.reporter ? (
          <span className="flex items-center gap-1.5 px-1.5 py-0.5">
            <UserAvatar
              id={item.reporter.id}
              name={item.reporter.name}
              size={20}
              avatarVersion={item.reporter.avatarVersion}
            />
            {item.reporter.name}
          </span>
        ) : (
          <span className="text-muted-foreground px-1.5">—</span>
        )}
      </Row>

      {item.type === 'BUG' && <BugFields item={item} disabled={!canWrite} onSave={save} />}
      {item.type === 'EPIC' && <EpicFields item={item} disabled={!canWrite} onSave={save} />}
    </dl>
  );
}

const RECURRENCE_FREQS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;

/** Tekrar kuralı (Faz 7.1): tamamlanınca bir sonraki örnek üretilir; bitiş tarihi gerekir. */
function RecurrenceInput({
  value,
  disabled,
  needsDueDate,
  onChange,
}: {
  value: WorkItemDetail['recurrence'];
  disabled: boolean;
  needsDueDate: boolean;
  onChange: (rule: WorkItemDetail['recurrence']) => void;
}) {
  const { t } = useTranslation();
  const hint = needsDueDate && !value;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <NativeSelect
          aria-label={t('recurrence.label')}
          value={value?.freq ?? ''}
          disabled={disabled || hint}
          className="h-8"
          onChange={(e) =>
            onChange(
              e.target.value === ''
                ? null
                : {
                    freq: e.target.value as (typeof RECURRENCE_FREQS)[number],
                    interval: value?.interval ?? 1,
                  },
            )
          }
        >
          <option value="">{t('recurrence.none')}</option>
          {RECURRENCE_FREQS.map((f) => (
            <option key={f} value={f}>
              {t(`recurrence.freq.${f}`)}
            </option>
          ))}
        </NativeSelect>
        {value && (
          <label className="text-muted-foreground flex items-center gap-1 text-xs">
            {t('recurrence.every')}
            <input
              type="number"
              min={1}
              max={365}
              defaultValue={value.interval}
              key={value.interval}
              disabled={disabled}
              aria-label={t('recurrence.interval')}
              className="bg-background h-8 w-16 rounded-md border px-2 text-sm"
              onBlur={(e) => {
                const interval = Math.min(
                  Math.max(Math.round(Number(e.target.value)) || 1, 1),
                  365,
                );
                if (interval !== value.interval) onChange({ ...value, interval });
              }}
            />
          </label>
        )}
      </div>
      {hint && <p className="text-muted-foreground text-xs">{t('recurrence.needsDueDate')}</p>}
      {value && <p className="text-muted-foreground text-xs">{t('recurrence.help')}</p>}
    </div>
  );
}

function DateInput({
  label,
  value,
  min,
  disabled,
  onChange,
}: {
  label: string;
  value: string | null;
  min?: string;
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <input
      type="date"
      value={value ?? ''}
      min={min}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(e.target.value || null)}
      className="border-input focus-visible:ring-ring/50 h-8 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px] disabled:opacity-60"
    />
  );
}

function Assignees({
  item,
  canWrite,
  onSave,
}: {
  item: WorkItemDetail;
  canWrite: boolean;
  onSave: (body: UpdateWorkItemRequest) => void;
}) {
  const { t } = useTranslation();
  const members = useMembers(canWrite).data?.members ?? [];
  const teams = useTeams(canWrite).data?.teams ?? [];
  const ids = item.assignees.map((a) => a.id);

  const chips = item.assignees.length ? (
    <span className="flex flex-wrap items-center gap-1.5">
      {item.assignees.map((a) => (
        <span key={a.id} className="flex items-center gap-1">
          <UserAvatar id={a.id} name={a.name} size={20} avatarVersion={a.avatarVersion} />
          <span>{a.name}</span>
        </span>
      ))}
    </span>
  ) : (
    <span className="text-muted-foreground">{t('detail.unassigned')}</span>
  );
  if (!canWrite) return <span className="px-1.5 py-0.5">{chips}</span>;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('detail.changeAssignees')}
          className="hover:bg-accent focus-visible:ring-ring/50 rounded-md px-1.5 py-0.5 text-left outline-none focus-visible:ring-[3px]"
        >
          {chips}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-y-auto">
        {teams.length > 0 && (
          <>
            <DropdownMenuLabel>{t('teams.addTeam')}</DropdownMenuLabel>
            {teams.map((team) => (
              <DropdownMenuItem
                key={team.id}
                disabled={team.members.length === 0}
                onSelect={() =>
                  onSave({ assigneeIds: [...new Set([...ids, ...team.members.map((m) => m.id)])] })
                }
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: team.color }}
                  aria-hidden
                />
                {team.name}
                <span className="text-muted-foreground ml-auto text-xs">{team.members.length}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        {members.map((m) => (
          <DropdownMenuCheckboxItem
            key={m.userId}
            checked={ids.includes(m.userId)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(checked) =>
              onSave({
                assigneeIds: checked ? [...ids, m.userId] : ids.filter((id) => id !== m.userId),
              })
            }
          >
            <UserAvatar id={m.userId} name={m.name} size={20} avatarVersion={m.avatarVersion} />
            {m.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LabelsPicker({
  item,
  canWrite,
  onSave,
}: {
  item: WorkItemDetail;
  canWrite: boolean;
  onSave: (body: UpdateWorkItemRequest) => void;
}) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const errorMessage = useErrorMessage();
  const { data } = useQuery({ ...labelsQuery(workspaceId, item.spaceId), enabled: canWrite });
  const createLabel = useCreateLabel();
  const [name, setName] = useState('');
  const ids = item.labels.map((l) => l.id);

  const chips = item.labels.length ? (
    <span className="flex flex-wrap gap-1">
      {item.labels.map((l) => (
        <LabelChip key={l.id} label={l} />
      ))}
    </span>
  ) : (
    <span className="text-muted-foreground">{t('detail.noLabels')}</span>
  );
  if (!canWrite) return <span className="px-1.5 py-0.5">{chips}</span>;

  const add = () => {
    const value = name.trim();
    if (!value) return;
    createLabel.mutate(
      { spaceId: item.spaceId, body: { name: value } },
      {
        onSuccess: ({ id }) => {
          setName('');
          onSave({ labelIds: [...ids, id] });
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('detail.changeLabels')}
          className="hover:bg-accent focus-visible:ring-ring/50 flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left outline-none focus-visible:ring-[3px]"
        >
          <Tag className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
          {chips}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
        {(data?.labels ?? []).map((label) => (
          <DropdownMenuCheckboxItem
            key={label.id}
            checked={ids.includes(label.id)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(checked) =>
              onSave({
                labelIds: checked ? [...ids, label.id] : ids.filter((id) => id !== label.id),
              })
            }
          >
            <span className="size-2.5 rounded-full" style={{ background: label.color }} />
            {label.name}
          </DropdownMenuCheckboxItem>
        ))}
        {(data?.labels.length ?? 0) > 0 && <DropdownMenuSeparator />}
        <div className="flex items-center gap-1 p-1.5" onKeyDown={(e) => e.stopPropagation()}>
          <input
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder={t('detail.newLabel')}
            aria-label={t('detail.newLabel')}
            className="border-input h-7 min-w-0 flex-1 rounded border bg-transparent px-2 text-sm outline-none"
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={add}
            aria-label={t('detail.addLabel')}
          >
            <Plus />
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LabelChip({ label }: { label: Label }) {
  return (
    <span
      className="rounded-full border px-2 text-xs"
      style={{ borderColor: label.color, color: label.color }}
    >
      {label.name}
    </span>
  );
}

type SaveFn = (body: UpdateWorkItemRequest) => void;

function BugFields({
  item,
  disabled,
  onSave,
}: {
  item: WorkItemDetail;
  disabled: boolean;
  onSave: SaveFn;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Row label={t('detail.severity')}>
        <NativeSelect
          aria-label={t('detail.severity')}
          value={item.severity ?? ''}
          disabled={disabled}
          className="h-8"
          onChange={(e) =>
            onSave({ severity: (e.target.value || null) as WorkItemDetail['severity'] })
          }
        >
          <option value="">—</option>
          {BUG_SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {t(`severity.${s}`)}
            </option>
          ))}
        </NativeSelect>
      </Row>
      <Row label={t('detail.foundInVersion')}>
        <input
          defaultValue={item.foundInVersion ?? ''}
          disabled={disabled}
          maxLength={100}
          aria-label={t('detail.foundInVersion')}
          onBlur={(e) => {
            const next = e.target.value.trim() || null;
            if (next !== item.foundInVersion) onSave({ foundInVersion: next });
          }}
          className="border-input focus-visible:ring-ring/50 h-8 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px]"
        />
      </Row>
      <div className="flex flex-col gap-3 py-3">
        <BlurTextarea
          label={t('detail.stepsToReproduce')}
          value={item.stepsToReproduce}
          disabled={disabled}
          onSave={(v) => onSave({ stepsToReproduce: v })}
        />
        <BlurTextarea
          label={t('detail.expectedResult')}
          value={item.expectedResult}
          disabled={disabled}
          onSave={(v) => onSave({ expectedResult: v })}
        />
        <BlurTextarea
          label={t('detail.actualResult')}
          value={item.actualResult}
          disabled={disabled}
          onSave={(v) => onSave({ actualResult: v })}
        />
        <BlurTextarea
          label={t('detail.environment')}
          value={item.environment}
          disabled={disabled}
          onSave={(v) => onSave({ environment: v })}
        />
      </div>
    </>
  );
}

function EpicFields({
  item,
  disabled,
  onSave,
}: {
  item: WorkItemDetail;
  disabled: boolean;
  onSave: SaveFn;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Row label={t('detail.progress')}>
        <div className="flex items-center gap-2">
          <div
            className="bg-muted h-1.5 w-32 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={item.progress ?? 0}
            aria-label={t('detail.progress')}
          >
            <div className="bg-status-done h-full" style={{ width: `${item.progress ?? 0}%` }} />
          </div>
          <span className="text-muted-foreground text-xs">%{item.progress ?? 0}</span>
        </div>
      </Row>
      {item.epicStats && item.epicStats.itemCount > 0 && (
        <Row label={t('detail.epicTotals')}>
          <span className="text-muted-foreground text-xs tabular-nums">
            {t('epics.points', {
              done: item.epicStats.donePoints,
              total: item.epicStats.points,
            })}
            {' · '}
            {t('epics.items', { done: item.epicStats.doneCount, total: item.epicStats.itemCount })}
            {item.epicStats.unestimatedCount > 0 &&
              ` · ${t('epics.unestimated', { count: item.epicStats.unestimatedCount })}`}
          </span>
        </Row>
      )}
      <Row label={t('detail.tshirtSize')}>
        <NativeSelect
          aria-label={t('detail.tshirtSize')}
          value={item.tshirtSize ?? ''}
          disabled={disabled}
          className="h-8"
          onChange={(e) =>
            onSave({ tshirtSize: (e.target.value || null) as WorkItemDetail['tshirtSize'] })
          }
        >
          <option value="">—</option>
          {TSHIRT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </NativeSelect>
      </Row>
      <Row label={t('spaceForm.color')}>
        <div className="flex flex-wrap gap-1.5">
          {SPACE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              disabled={disabled}
              aria-label={color}
              aria-pressed={item.color === color}
              onClick={() => onSave({ color: item.color === color ? null : color })}
              className={cn(
                'size-5 rounded-full border-2 border-transparent outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                item.color === color && 'border-background',
              )}
              style={{
                background: color,
                boxShadow: item.color === color ? `0 0 0 2px ${color}` : undefined,
              }}
            />
          ))}
        </div>
      </Row>
      <div className="py-3">
        <BlurTextarea
          label={t('detail.goal')}
          value={item.goal}
          disabled={disabled}
          onSave={(v) => onSave({ goal: v })}
        />
      </div>
    </>
  );
}

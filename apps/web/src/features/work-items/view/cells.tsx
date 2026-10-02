import {
  ESTIMATE_KIND,
  FIBONACCI_SCALE,
  PRIORITIES,
  TSHIRT_POINTS,
  type Priority,
  type SpaceDetail,
  type UpdateWorkItemRequest,
  type WorkItemSummary,
} from '@scrum/shared';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserAvatar } from '@/components/user-avatar';
import { PriorityIcon, StatusBadge } from '@/components/work-item/work-item-visuals';
import { formatShortDate } from '@/lib/format';
import { estimateLabel } from './cell-utils';
import { cn } from '@/lib/utils';

/** Satır hücrelerinin ortak bağlamı: Space, yetkiler ve değişiklik işlemleri. */
export interface CellContext {
  space: SpaceDetail;
  canWrite: boolean;
  canEstimate: boolean;
  canChangeStatus: (item: WorkItemSummary) => boolean;
  onStatus: (itemId: string, statusId: string) => void;
  onPatch: (itemId: string, body: UpdateWorkItemRequest) => void;
}

export function StatusCell({ item, ctx }: { item: WorkItemSummary; ctx: CellContext }) {
  const { t } = useTranslation();
  const status = ctx.space.statuses.find((s) => s.id === item.statusId);
  if (!status) return null;
  const badge = <StatusBadge category={status.category} label={status.name} color={status.color} />;
  if (!ctx.canChangeStatus(item)) return badge;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('items.changeStatus', { key: item.key })}
          className="focus-visible:ring-ring/50 rounded-md outline-none focus-visible:ring-[3px]"
        >
          {badge}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={item.statusId}
          onValueChange={(id) => ctx.onStatus(item.id, id)}
        >
          {ctx.space.statuses.map((s) => (
            <DropdownMenuRadioItem key={s.id} value={s.id}>
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              {s.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PriorityCell({ item, ctx }: { item: WorkItemSummary; ctx: CellContext }) {
  const { t } = useTranslation();
  if (!ctx.canWrite) return <PriorityIcon priority={item.priority} />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('items.changePriority', { key: item.key })}
          className="hover:bg-accent focus-visible:ring-ring/50 rounded p-1 outline-none focus-visible:ring-[3px]"
        >
          <PriorityIcon priority={item.priority} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={item.priority}
          onValueChange={(value) => ctx.onPatch(item.id, { priority: value as Priority })}
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
  );
}

export function AssigneeStack({ item, max = 3 }: { item: WorkItemSummary; max?: number }) {
  const shown = item.assignees.slice(0, max);
  return (
    <span className="flex items-center">
      {shown.map((a, i) => (
        <span
          key={a.id}
          className={cn('border-card inline-flex rounded-full border-2', i > 0 && '-ml-1.5')}
        >
          <UserAvatar id={a.id} name={a.name} size={22} avatarVersion={a.avatarVersion} />
        </span>
      ))}
      {item.assignees.length > shown.length && (
        <span className="text-muted-foreground ml-1 text-xs">
          +{item.assignees.length - shown.length}
        </span>
      )}
    </span>
  );
}

/** Bitiş: salt okunur metin; gecikmişse kırmızı. `editable` ise tarih girişi (Table). */
export function DueCell({
  item,
  overdue,
  field = 'dueDate',
  editable,
  onChange,
}: {
  item: WorkItemSummary;
  overdue?: boolean;
  field?: 'dueDate' | 'startDate';
  editable?: boolean;
  onChange?: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  const value = item[field];
  if (editable && onChange) {
    return (
      <input
        type="date"
        value={value ?? ''}
        aria-label={t(field === 'dueDate' ? 'detail.dueDate' : 'detail.startDate')}
        onChange={(e) => onChange(e.target.value || null)}
        className={cn(
          'hover:border-input focus-visible:ring-ring/50 h-7 w-full rounded border border-transparent bg-transparent px-1 text-xs outline-none focus-visible:ring-[3px]',
          overdue && 'text-destructive font-medium',
        )}
      />
    );
  }
  return (
    <span
      className={cn('text-xs', overdue ? 'text-destructive font-medium' : 'text-muted-foreground')}
      title={overdue ? t('items.overdue') : undefined}
    >
      {value ? formatShortDate(value) : ''}
    </span>
  );
}

/** Tahmin: salt okunur etiket; `editable` ise ölçeğe göre seçim/sayı girişi (Table). */
export function EstimateCell({
  item,
  ctx,
  editable,
}: {
  item: WorkItemSummary;
  ctx: CellContext;
  editable?: boolean;
}) {
  const { t } = useTranslation();
  const scale = ctx.space.estimationScale;
  if (!editable || !ctx.canEstimate) {
    return <span className="text-muted-foreground text-xs">{estimateLabel(item, scale)}</span>;
  }
  const inputClass =
    'hover:border-input focus-visible:ring-ring/50 h-7 w-full rounded border border-transparent bg-transparent px-1 text-xs outline-none focus-visible:ring-[3px]';

  if (ESTIMATE_KIND[item.type] === 'HOURS') {
    return (
      <input
        type="number"
        min={0}
        step="0.25"
        key={item.estimateHours ?? 'none'}
        defaultValue={item.estimateHours ?? ''}
        aria-label={t('detail.hours')}
        onBlur={(e) => {
          const next = e.target.value === '' ? null : Number(e.target.value);
          if (next !== item.estimateHours) ctx.onPatch(item.id, { estimateHours: next });
        }}
        className={inputClass}
      />
    );
  }
  if (scale === 'NUMBER') {
    return (
      <input
        type="number"
        min={0}
        step="any"
        key={item.points ?? 'none'}
        defaultValue={item.points ?? ''}
        aria-label={t('detail.points')}
        onBlur={(e) => {
          const next = e.target.value === '' ? null : Number(e.target.value);
          if (next !== item.points) ctx.onPatch(item.id, { points: next });
        }}
        className={inputClass}
      />
    );
  }
  const options: Array<[string, number]> =
    scale === 'FIBONACCI'
      ? FIBONACCI_SCALE.map((n) => [String(n), n])
      : Object.entries(TSHIRT_POINTS).map(([size, n]) => [size, n]);
  return (
    <select
      value={item.points ?? ''}
      aria-label={t('detail.points')}
      onChange={(e) =>
        ctx.onPatch(item.id, { points: e.target.value === '' ? null : Number(e.target.value) })
      }
      className={cn(inputClass, 'appearance-none')}
    >
      <option value="">—</option>
      {options.map(([label, n]) => (
        <option key={label} value={n}>
          {label}
        </option>
      ))}
    </select>
  );
}

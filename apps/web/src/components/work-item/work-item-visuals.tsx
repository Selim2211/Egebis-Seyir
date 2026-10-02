import type { Priority, StatusCategory, WorkItemType } from '@scrum/shared';
import {
  Bookmark,
  Bug,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CornerDownRight,
  Flag,
  SquareCheckBig,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/*
 * Tip, öncelik ve durum görselleri uygulamanın tek kaynağıdır (brief §11 "tutarlı görsel dil").
 * Liste, board, detay paneli ve raporlar bu bileşenleri kullanır; renk/ikon başka yerde tanımlanmaz.
 */

const TYPE_VISUALS: Record<WorkItemType, { icon: LucideIcon; className: string }> = {
  EPIC: { icon: Zap, className: 'text-type-epic' },
  STORY: { icon: Bookmark, className: 'text-type-story' },
  TASK: { icon: SquareCheckBig, className: 'text-type-task' },
  SUBTASK: { icon: CornerDownRight, className: 'text-type-subtask' },
  BUG: { icon: Bug, className: 'text-type-bug' },
};

export function WorkItemTypeIcon({ type, className }: { type: WorkItemType; className?: string }) {
  const { t } = useTranslation();
  const { icon: Icon, className: color } = TYPE_VISUALS[type];
  return (
    <Icon
      className={cn('size-4 shrink-0', color, className)}
      aria-label={t(`workItemType.${type}`)}
      role="img"
    />
  );
}

const PRIORITY_CLASS: Record<Priority, string> = {
  URGENT: 'text-priority-urgent fill-priority-urgent',
  HIGH: 'text-priority-high fill-priority-high',
  NORMAL: 'text-priority-normal',
  LOW: 'text-priority-low',
};

export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  const { t } = useTranslation();
  return (
    <Flag
      className={cn('size-4 shrink-0', PRIORITY_CLASS[priority], className)}
      aria-label={t(`priority.${priority}`)}
      role="img"
    />
  );
}

const STATUS_VISUALS: Record<StatusCategory, { icon: LucideIcon; className: string }> = {
  NOT_STARTED: {
    icon: CircleDashed,
    className: 'text-status-not-started bg-status-not-started/10',
  },
  ACTIVE: { icon: CircleDot, className: 'text-status-active bg-status-active/10' },
  DONE: { icon: CircleCheck, className: 'text-status-done bg-status-done/10' },
};

/**
 * Durum rozeti. `label` verilmezse kategori adı gösterilir. `color` Space durumunun kendi rengidir
 * (ADR-036); verilmezse kategori rengi kullanılır.
 */
export function StatusBadge({
  category,
  label,
  color,
}: {
  category: StatusCategory;
  label?: string;
  color?: string;
}) {
  const { t } = useTranslation();
  const { icon: Icon, className } = STATUS_VISUALS[category];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium',
        color ? 'text-foreground' : className,
      )}
      style={color ? { backgroundColor: `${color}26` } : undefined}
    >
      <Icon className="size-3.5" aria-hidden style={color ? { color } : undefined} />
      {label ?? t(`statusCategory.${category}`)}
    </span>
  );
}

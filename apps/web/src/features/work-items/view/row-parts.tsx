import type { WorkItemSummary } from '@scrum/shared';
import { Archive, ChevronRight, Copy, CornerDownRight, MoreHorizontal, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { ItemGroup } from './view-state';

/** Satır işlemleri: alt öğe ekle, kopyala, arşivle, sil. */
export function RowMenu({
  item,
  canAddChild,
  onAddChild,
  onCopy,
  onArchive,
  onDelete,
  alwaysVisible,
}: {
  item: WorkItemSummary;
  canAddChild: boolean;
  onAddChild: () => void;
  onCopy: () => void;
  onArchive: () => void;
  onDelete: () => void;
  alwaysVisible?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'size-7',
            !alwaysVisible &&
              'md:opacity-0 md:group-hover/item:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100',
          )}
          aria-label={t('items.actions', { key: item.key })}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {canAddChild && (
          <DropdownMenuItem onSelect={onAddChild}>
            <CornerDownRight />
            {t('items.addChild')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onCopy}>
          <Copy />
          {t('items.copy')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onArchive}>
          <Archive />
          {t('structure.archive')}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 />
          {t('structure.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Grup başlığı: aç/kapa, ad, renk noktası ve öğe sayısı. */
export function GroupHeader({
  group,
  collapsed,
  onToggle,
}: {
  group: ItemGroup;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const label = group.labelKey ? t(group.labelKey) : group.label;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className="bg-muted/50 hover:bg-muted flex h-8 w-full items-center gap-2 border-b px-3 text-left text-xs font-semibold"
    >
      <ChevronRight
        className={cn('size-3.5 transition-transform', !collapsed && 'rotate-90')}
        aria-hidden
      />
      {group.color && (
        <span className="size-2 rounded-full" style={{ background: group.color }} aria-hidden />
      )}
      <span>{label}</span>
      <span className="text-muted-foreground font-normal">{group.items.length}</span>
    </button>
  );
}

/** Satır seçim kutusu. */
export function SelectBox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
      className="accent-primary size-4 shrink-0"
    />
  );
}

import type { SprintSummary } from '@scrum/shared';
import { ArrowRightLeft, CornerDownRight, Layers, Unlink, X, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { BACKLOG_OPTION, OTHER_OPTION } from './bulk-utils';

type Tone = 'violet' | 'amber' | 'sky' | 'rose';
const TONES: Record<Tone, string> = {
  violet: 'text-violet-700 [&_svg]:text-violet-600',
  amber: 'text-amber-700 [&_svg]:text-amber-600',
  sky: 'text-sky-700 [&_svg]:text-sky-600',
  rose: 'text-rose-700 [&_svg]:text-rose-600',
};

/**
 * Backlog'da kutucukla seçince ekranın altında yüzen renkli işlem çubuğu (ADR-126/130). Her işlemin kendi
 * rengi ve açıklaması (üzerine gelince) vardır; yalnızca seçime uyan işlemler görünür.
 */
export function SelectionBar({
  count,
  quickTargets,
  onMove,
  onGroup,
  onConvert,
  onNest,
  onUnnest,
  onClear,
  note,
}: {
  count: number;
  /** Sprint'e taşıma listesi (null: taşınamaz). */
  quickTargets: readonly SprintSummary[] | null;
  onMove: (value: string) => void;
  onGroup?: () => void;
  onConvert?: () => void;
  onNest?: () => void;
  onUnnest?: () => void;
  onClear: () => void;
  note?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="region"
      aria-label={t('backlog.selection')}
      className="sticky bottom-4 z-30 flex flex-wrap items-center gap-2 rounded-2xl bg-gradient-to-r from-[var(--brand-1)] to-[var(--brand-2)] px-3 py-2.5 text-sm text-white shadow-[0_12px_32px_-8px] shadow-violet-500/50"
    >
      <span className="flex items-center gap-1.5 rounded-full bg-white/20 py-1 pr-3 pl-1 font-semibold">
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-xs text-violet-700 tabular-nums">
          {count}
        </span>{' '}
        {t('backlog.selectedShort')}
      </span>
      {quickTargets && (
        <label className="flex h-8 items-center gap-1.5 rounded-lg bg-white pl-2.5 text-violet-700 shadow-sm">
          <ArrowRightLeft className="size-4 shrink-0" aria-hidden />
          <select
            value=""
            aria-label={t('backlog.moveSelected')}
            title={t('bulk.hint.move')}
            onChange={(e) => e.target.value && onMove(e.target.value)}
            className="h-8 cursor-pointer rounded-lg bg-transparent pr-2 text-sm font-medium outline-none"
          >
            <option value="">{t('backlog.moveSelected')}</option>
            <option value={BACKLOG_OPTION}>{t('moveItem.backlog')}</option>
            {quickTargets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value={OTHER_OPTION}>{t('moveSelected.other')}</option>
          </select>
        </label>
      )}
      {onGroup && (
        <BarButton
          tone="violet"
          testId="group-selected"
          hint={t('bulk.hint.group')}
          onClick={onGroup}
        >
          <Layers /> {t('groupEpic.action')}
        </BarButton>
      )}
      {onConvert && (
        <BarButton
          tone="amber"
          testId="convert-selected"
          hint={t('bulk.hint.convert')}
          onClick={onConvert}
        >
          <Zap /> {t('promoteEpic.menu')}
        </BarButton>
      )}
      {onNest && (
        <BarButton tone="sky" testId="nest-selected" hint={t('bulk.hint.nest')} onClick={onNest}>
          <CornerDownRight /> {t('bulk.nestAction')}
        </BarButton>
      )}
      {onUnnest && (
        <BarButton
          tone="rose"
          testId="unnest-selected"
          hint={t('bulk.hint.unnest')}
          onClick={onUnnest}
        >
          <Unlink /> {t('bulk.unnestAction')}
        </BarButton>
      )}
      {note && <span className="order-last w-full pl-1 text-xs text-white/85">{note}</span>}
      <button
        type="button"
        onClick={onClear}
        title={t('bulk.hint.clear')}
        className="ml-auto flex h-8 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-white/90 hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
      >
        <X className="size-4" aria-hidden />
        {t('backlog.clearSelection')}
      </button>
    </div>
  );
}

function BarButton({
  tone,
  testId,
  hint,
  onClick,
  children,
}: {
  tone: Tone;
  testId: string;
  hint: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      title={hint}
      onClick={onClick}
      className={cn(
        'flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium shadow-sm transition-transform hover:-translate-y-px hover:shadow focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none active:translate-y-0 [&_svg]:size-4',
        TONES[tone],
      )}
    >
      {children}
    </button>
  );
}

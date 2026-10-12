import type { SprintSummary } from '@scrum/shared';
import { useTranslation } from 'react-i18next';
import { PercentBar } from '@/components/work-item/percent-bar';

/**
 * Sprint özeti (ADR-107): toplam Story Point, tamamlanma yüzdesi ve puanın kişilere dağılımı.
 * Çok kişili işin puanı eşit bölünür; atanmamış işler ayrı satırdadır.
 */
export function SprintStats({ sprint }: { sprint: SprintSummary }) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t('sprintStats.title', { name: sprint.name })}
      className="bg-muted/30 grid gap-3 border-t px-4 py-3 text-sm sm:grid-cols-[minmax(12rem,16rem)_1fr]"
    >
      <div className="flex flex-col gap-1.5">
        <p className="tabular-nums">
          <span className="text-lg font-semibold">{sprint.points}</span>{' '}
          <span className="text-muted-foreground">{t('sprintStats.totalPoints')}</span>
        </p>
        <p className="text-muted-foreground text-xs tabular-nums">
          {t('sprintStats.donePoints', { done: sprint.donePoints, total: sprint.points })}
        </p>
        <div className="flex items-center gap-2">
          <PercentBar
            value={sprint.percentDone}
            label={t('sprintStats.percent')}
            className="flex-1"
          />
          <span className="w-10 text-right text-xs font-medium tabular-nums">
            {sprint.percentDone}%
          </span>
        </div>
      </div>
      <div>
        <h3 className="text-muted-foreground mb-1 text-xs font-medium uppercase">
          {t('sprintStats.byPerson')}
        </h3>
        {sprint.byAssignee.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t('sprintStats.noItems')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {sprint.byAssignee.map((row) => (
              <li
                key={row.userId ?? 'none'}
                className="grid grid-cols-[minmax(6rem,10rem)_4.5rem_1fr_2.5rem] items-center gap-2"
              >
                <span className="truncate">{row.name ?? t('sprintStats.unassigned')}</span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {t('sprintStats.personPoints', { points: row.points })}
                </span>
                <PercentBar
                  value={row.percentDone}
                  label={t('sprintStats.personPercent', { name: row.name ?? '' })}
                />
                <span className="text-right text-xs tabular-nums">{row.percentDone}%</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

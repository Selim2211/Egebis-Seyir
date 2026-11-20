import { SPRINT_GOAL_MIN_LENGTH } from '@scrum/shared';
import { useTranslation } from 'react-i18next';

/** Hedef karakter sayacı: boşken nötr, 64'ün altında uyarı, üstünde yeşil. */
export function GoalCount({ length }: { length: number }) {
  const { t } = useTranslation();
  const tone =
    length === 0
      ? 'text-muted-foreground'
      : length < SPRINT_GOAL_MIN_LENGTH
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-emerald-700 dark:text-emerald-400';
  return (
    <span className={`tabular-nums ${tone}`} data-testid="goal-count">
      {t('sprints.goalCount', { count: length, min: SPRINT_GOAL_MIN_LENGTH })}
    </span>
  );
}

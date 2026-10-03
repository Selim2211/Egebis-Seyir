import { Rows3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NativeSelect } from '@/components/form';
import { SWIMLANES, type Swimlane } from './board-model';

/** Board satır gruplaması seçici (brief §5.9). */
export function SwimlanePicker({
  value,
  onChange,
}: {
  value: Swimlane;
  onChange: (lane: Swimlane) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <Rows3 className="text-muted-foreground size-4" aria-hidden />
      <span className="sr-only sm:not-sr-only">{t('board.swimlane')}</span>
      <NativeSelect
        value={value}
        onChange={(e) => onChange(e.target.value as Swimlane)}
        aria-label={t('board.swimlane')}
        className="h-8"
      >
        {SWIMLANES.map((lane) => (
          <option key={lane} value={lane}>
            {t(`board.lanes.${lane}`)}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}

import type { ItemReadiness } from '@scrum/shared';
import { CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useErrorMessage } from '@/lib/use-error-message';
import { useSetReadiness } from '../queries';

/**
 * Definition of Ready / Done maddeleri (brief §6.3, ADR-065): Space'in maddeleri, öğede işaretlenir.
 * Yalnızca Story ve Bug'da, Space'te madde tanımlıysa görünür.
 */
export function ReadinessSection({
  itemId,
  readiness,
  canWrite,
}: {
  itemId: string;
  readiness: ItemReadiness;
  canWrite: boolean;
}) {
  if (readiness.dor.length === 0 && readiness.dod.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Block kind="dor" itemId={itemId} entries={readiness.dor} canWrite={canWrite} />
      <Block
        kind="dod"
        itemId={itemId}
        entries={readiness.dod}
        canWrite={canWrite}
        enforced={readiness.dodEnforced}
      />
    </div>
  );
}

function Block({
  kind,
  itemId,
  entries,
  canWrite,
  enforced,
}: {
  kind: 'dor' | 'dod';
  itemId: string;
  entries: ItemReadiness['dor'];
  canWrite: boolean;
  enforced?: boolean;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const set = useSetReadiness();
  // İşaret anında görünür; sunucu yanıtı ve yenileme gelince yerel durum bırakılır.
  const [optimistic, setOptimistic] = useState<ReadonlySet<string> | null>(null);
  if (entries.length === 0) return null;
  const isChecked = (e: { text: string; checked: boolean }) =>
    optimistic ? optimistic.has(e.text) : e.checked;
  const checked = entries.filter(isChecked).length;
  const complete = checked === entries.length;

  const toggle = (text: string, on: boolean) => {
    const next = entries.filter((e) => (e.text === text ? on : isChecked(e))).map((e) => e.text);
    setOptimistic(new Set(next));
    set.mutate(
      { itemId, kind, checked: next },
      {
        onError: (error) => toast.error(errorMessage(error)),
        onSettled: () => setOptimistic(null),
      },
    );
  };

  return (
    <section aria-labelledby={`readiness-${kind}`} className="rounded-md border p-3">
      <h3 id={`readiness-${kind}`} className="flex items-center gap-2 text-sm font-semibold">
        {t(`readiness.${kind}`)}
        <span className="text-muted-foreground text-xs font-normal tabular-nums">
          {checked}/{entries.length}
        </span>
        {complete && (
          <CircleCheck className="size-4 text-emerald-600" aria-label={t('readiness.complete')} />
        )}
        {kind === 'dod' && enforced && (
          <span className="text-muted-foreground ml-auto text-xs font-normal">
            {t('readiness.enforced')}
          </span>
        )}
      </h3>
      <ul className="mt-2 flex flex-col gap-1.5">
        {entries.map((entry) => (
          <li key={entry.text}>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={isChecked(entry)}
                disabled={!canWrite}
                onChange={(e) => toggle(entry.text, e.target.checked)}
                className="accent-primary mt-0.5 size-4"
              />
              <span className={isChecked(entry) ? 'text-muted-foreground line-through' : undefined}>
                {entry.text}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

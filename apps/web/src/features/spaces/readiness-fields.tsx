import { MAX_READINESS_ITEMS } from '@scrum/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { parseItems, type SpaceFormValues } from './space-form-model';

/**
 * Space ayarlarında Definition of Done maddeleri (brief §6.3; Ready kaldırıldı, ADR-176): her satır bir madde.
 * Yazarken boş satır kalabilsin diye ham metin yerelde tutulur, yalnızca ayrıştırılmış liste yukarı gider.
 */
export function ReadinessFields({
  values,
  onChange,
}: {
  values: Pick<SpaceFormValues, 'dodItems' | 'dodEnforced'>;
  onChange: (patch: Partial<SpaceFormValues>) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [dod, setDod] = useState(values.dodItems.join('\n'));

  return (
    <div className="flex max-w-2xl flex-col gap-1.5">
      <Label htmlFor={`${id}-dod`}>{t('readiness.dodSetting')}</Label>
      <Textarea
        id={`${id}-dod`}
        rows={5}
        value={dod}
        placeholder={t('readiness.dodPlaceholder')}
        onChange={(e) => {
          setDod(e.target.value);
          onChange({ dodItems: parseItems(e.target.value) });
        }}
      />
      <p className="text-muted-foreground text-xs">
        {t('readiness.help', { max: MAX_READINESS_ITEMS })}
      </p>
      <div className="mt-2 flex items-start gap-3">
        <Switch
          id={`${id}-enforced`}
          checked={values.dodEnforced}
          onCheckedChange={(checked) => onChange({ dodEnforced: checked })}
          aria-describedby={`${id}-enforced-help`}
          className="mt-0.5"
        />
        <div>
          <Label htmlFor={`${id}-enforced`}>{t('readiness.dodEnforced')}</Label>
          <p id={`${id}-enforced-help`} className="text-muted-foreground mt-0.5 text-xs">
            {t('readiness.dodEnforcedHelp')}
          </p>
        </div>
      </div>
    </div>
  );
}

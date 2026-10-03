import { MAX_READINESS_ITEMS } from '@scrum/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { parseItems, type SpaceFormValues } from './space-form-model';

/**
 * Space ayarlarında Definition of Done / Ready maddeleri (brief §6.3): her satır bir madde.
 * Yazarken boş satır kalabilsin diye ham metin yerelde tutulur, yalnızca ayrıştırılmış liste yukarı gider.
 */
export function ReadinessFields({
  values,
  onChange,
}: {
  values: Pick<SpaceFormValues, 'dodItems' | 'dorItems' | 'dodEnforced'>;
  onChange: (patch: Partial<SpaceFormValues>) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [dod, setDod] = useState(values.dodItems.join('\n'));
  const [dor, setDor] = useState(values.dorItems.join('\n'));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-dor`}>{t('readiness.dorSetting')}</Label>
        <Textarea
          id={`${id}-dor`}
          rows={5}
          value={dor}
          placeholder={t('readiness.dorPlaceholder')}
          onChange={(e) => {
            setDor(e.target.value);
            onChange({ dorItems: parseItems(e.target.value) });
          }}
        />
        <p className="text-muted-foreground text-xs">
          {t('readiness.help', { max: MAX_READINESS_ITEMS })}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
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
        <div className="mt-1 flex items-start gap-3">
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
    </div>
  );
}

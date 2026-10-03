import {
  ESTIMATION_SCALES,
  type EstimationScale,
  SPACE_COLORS,
  SPACE_ICONS,
  SPRINT_LENGTH_WEEKS,
} from '@scrum/shared';
import { Lock, Users } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, SelectField } from '@/components/form';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { SpaceAvatar } from './space-avatar';
import type { SpaceFormErrors, SpaceFormValues } from './space-form-model';
import { SPACE_ICON_COMPONENTS } from './space-icons';

const SPRINT_WEEKS = Array.from(
  { length: SPRINT_LENGTH_WEEKS.max - SPRINT_LENGTH_WEEKS.min + 1 },
  (_, i) => SPRINT_LENGTH_WEEKS.min + i,
);

/** Space oluşturma penceresi ve Space ayarlarının ortak alanları (taslak 7). */
export function SpaceFields({
  values,
  errors,
  onChange,
  onNameChange,
}: {
  values: SpaceFormValues;
  errors: SpaceFormErrors;
  onChange: (patch: Partial<SpaceFormValues>) => void;
  /** Ad değişince anahtar önerisi gibi ek davranışlar için. */
  onNameChange?: (name: string) => void;
}) {
  const { t } = useTranslation();
  const descriptionId = useId();
  const example = values.key.trim().toUpperCase() || 'MOB';

  return (
    <>
      <div className="flex items-start gap-3">
        <SpaceAvatar
          space={{ name: values.name || '?', color: values.color, icon: values.icon }}
          size={56}
          className="mt-5.5 hidden sm:inline-flex"
        />
        <Field
          className="min-w-0 flex-1"
          label={t('spaceForm.name')}
          value={values.name}
          maxLength={80}
          autoFocus
          error={errors.name}
          onChange={(e) => (onNameChange ?? ((name) => onChange({ name })))(e.target.value)}
        />
        <Field
          className="w-28"
          label={t('spaceForm.key')}
          value={values.key}
          maxLength={10}
          autoCapitalize="characters"
          error={errors.key}
          onChange={(e) => onChange({ key: e.target.value.toUpperCase() })}
          style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}
        />
      </div>
      <p className="text-muted-foreground -mt-2 text-xs sm:pl-17">
        {errors.key
          ? t('spaceForm.keyRules')
          : t('spaceForm.keyHint', { example: `${example}-1, ${example}-2…` })}
      </p>

      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mb-2 text-sm font-medium">{t('spaceForm.color')}</legend>
        {SPACE_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={color}
            aria-pressed={values.color === color}
            onClick={() => onChange({ color })}
            className={cn(
              'focus-visible:ring-ring/50 size-6 rounded-full border-2 border-transparent outline-none focus-visible:ring-[3px]',
              values.color === color && 'border-background',
            )}
            style={{
              background: color,
              boxShadow: values.color === color ? `0 0 0 2px ${color}` : undefined,
            }}
          />
        ))}
      </fieldset>

      <fieldset className="flex flex-wrap items-center gap-1">
        <legend className="mb-2 text-sm font-medium">{t('spaceForm.icon')}</legend>
        <IconOption
          selected={values.icon === null}
          label={t('spaceForm.iconLetter')}
          onSelect={() => onChange({ icon: null })}
        >
          <span className="text-xs font-bold">
            {(values.name.trim()[0] ?? 'A').toLocaleUpperCase('tr')}
          </span>
        </IconOption>
        {SPACE_ICONS.map((icon) => {
          const Icon = SPACE_ICON_COMPONENTS[icon];
          return (
            <IconOption
              key={icon}
              selected={values.icon === icon}
              label={icon}
              onSelect={() => onChange({ icon })}
            >
              <Icon className="size-4" />
            </IconOption>
          );
        })}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={descriptionId}>
          {t('spaceForm.description')}{' '}
          <span className="text-muted-foreground text-xs font-normal">{t('common.optional')}</span>
        </Label>
        <Textarea
          id={descriptionId}
          rows={2}
          maxLength={500}
          value={values.description}
          placeholder={t('spaceForm.descriptionPlaceholder')}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>

      <ChoiceGroup
        legend={t('spaceForm.visibility')}
        options={[
          {
            selected: !values.isPrivate,
            icon: Users,
            title: t('spaceForm.public'),
            description: t('spaceForm.publicHelp'),
            onSelect: () => onChange({ isPrivate: false }),
          },
          {
            selected: values.isPrivate,
            icon: Lock,
            title: t('spaceForm.private'),
            description: t('spaceForm.privateHelp'),
            onSelect: () => onChange({ isPrivate: true }),
          },
        ]}
      />

      <ChoiceGroup
        legend={t('spaceForm.mode')}
        options={[
          {
            selected: values.scrumEnabled,
            title: t('spaceForm.modeScrum'),
            description: t('spaceForm.modeScrumHelp'),
            onSelect: () => onChange({ scrumEnabled: true }),
          },
          {
            selected: !values.scrumEnabled,
            title: t('spaceForm.modeSimple'),
            description: t('spaceForm.modeSimpleHelp'),
            onSelect: () => onChange({ scrumEnabled: false }),
          },
        ]}
      />

      {values.scrumEnabled && (
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label={t('spaceForm.sprintLength')}
            value={values.sprintLengthWeeks}
            onChange={(e) => onChange({ sprintLengthWeeks: Number(e.target.value) })}
          >
            {SPRINT_WEEKS.map((w) => (
              <option key={w} value={w}>
                {t('spaceForm.weeks', { count: w })}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('spaceForm.estimationScale')}
            value={values.estimationScale}
            onChange={(e) => onChange({ estimationScale: e.target.value as EstimationScale })}
          >
            {ESTIMATION_SCALES.map((s) => (
              <option key={s} value={s}>
                {t(`estimationScale.${s}`)}
              </option>
            ))}
          </SelectField>
          <div className="flex items-start gap-3 sm:col-span-2">
            <Switch
              id={`${descriptionId}-goal-required`}
              checked={values.sprintGoalRequired}
              onCheckedChange={(checked) => onChange({ sprintGoalRequired: checked })}
              aria-describedby={`${descriptionId}-goal-required-help`}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor={`${descriptionId}-goal-required`}>
                {t('spaceForm.goalRequired')}
              </Label>
              <p
                id={`${descriptionId}-goal-required-help`}
                className="text-muted-foreground mt-0.5 text-xs"
              >
                {t('spaceForm.goalRequiredHelp')}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function IconOption({
  selected,
  label,
  onSelect,
  children,
}: {
  selected: boolean;
  label: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'text-muted-foreground hover:bg-accent focus-visible:ring-ring/50 inline-flex size-8 items-center justify-center rounded-md border border-transparent outline-none focus-visible:ring-[3px]',
        selected && 'border-primary bg-primary/10 text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function ChoiceGroup({
  legend,
  options,
}: {
  legend: string;
  options: Array<{
    selected: boolean;
    title: string;
    description: string;
    icon?: React.ComponentType<{ className?: string }>;
    onSelect: () => void;
  }>;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.title}
            className={cn(
              'has-focus-visible:ring-ring/50 flex cursor-pointer gap-2.5 rounded-lg border p-3 has-focus-visible:ring-[3px]',
              o.selected && 'border-primary bg-primary/5',
            )}
          >
            <input
              type="radio"
              name={name}
              checked={o.selected}
              onChange={o.onSelect}
              className="accent-primary mt-0.5"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                {o.icon && <o.icon className="size-3.5" />}
                {o.title}
              </span>
              <span className="text-muted-foreground mt-0.5 block text-xs">{o.description}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

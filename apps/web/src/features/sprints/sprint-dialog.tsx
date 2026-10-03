import type { SprintSummary } from '@scrum/shared';
import { type FormEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormError } from '@/components/form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { todayDay } from '@/lib/format';
import { useCreateSprint, useUpdateSprint } from './queries';
import {
  type SprintFormErrors,
  type SprintFormValues,
  suggestSprint,
  toSprintBody,
  validateSprint,
} from './sprint-form-model';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  /** Space'in varsayılan sprint süresi (hafta). */
  weeks: number;
  /** Önerilen ad ve tarihler için mevcut sprint'ler. */
  existing: ReadonlyArray<{ endDate: string }>;
  /** Verilirse düzenleme; yoksa yeni sprint. */
  editing?: SprintSummary;
}

/** Sprint oluşturma/düzenleme penceresi (brief §5.6). */
export function SprintDialog(props: Props) {
  const { t } = useTranslation();
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel={t('common.close')}>
        {/* İçerik her açılışta sıfırdan kurulur. */}
        {open && <SprintForm {...props} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function SprintForm({ spaceId, weeks, existing, editing, onDone }: Props & { onDone: () => void }) {
  const { t } = useTranslation();
  const ids = useId();
  const create = useCreateSprint(spaceId);
  const update = useUpdateSprint();
  const [values, setValues] = useState<SprintFormValues>(() =>
    editing
      ? {
          name: editing.name,
          goal: editing.goal ?? '',
          startDate: editing.startDate,
          endDate: editing.endDate,
          capacityNote: editing.capacityNote ?? '',
        }
      : suggestSprint(existing, todayDay(), weeks),
  );
  const [errors, setErrors] = useState<SprintFormErrors>({});
  const change = (patch: Partial<SprintFormValues>) => setValues((v) => ({ ...v, ...patch }));
  // Aktif sprint'in tarihleri sabittir (brief §6.1.2).
  const datesLocked = editing?.status === 'ACTIVE';
  const mutation = editing ? update : create;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validateSprint(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const body = toSprintBody(values);
    const done = () => {
      toast.success(t(editing ? 'sprints.updated' : 'sprints.created', { name: body.name }));
      onDone();
    };
    if (editing) {
      update.mutate(
        {
          sprintId: editing.id,
          body: datesLocked ? { ...body, startDate: undefined, endDate: undefined } : body,
        },
        { onSuccess: done },
      );
    } else {
      create.mutate(body, { onSuccess: done });
    }
  };

  const message = (field: keyof SprintFormErrors) => {
    const code = errors[field];
    return code ? t(`sprints.errors.${code}`) : undefined;
  };

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
      <DialogHeader>
        <DialogTitle>{t(editing ? 'sprints.editTitle' : 'sprints.createTitle')}</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-name`}>{t('sprints.name')}</Label>
          <Input
            id={`${ids}-name`}
            value={values.name}
            maxLength={80}
            autoFocus
            aria-invalid={errors.name ? true : undefined}
            onChange={(e) => change({ name: e.target.value })}
          />
          {message('name') && <p className="text-destructive text-xs">{message('name')}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-goal`}>{t('sprints.goal')}</Label>
          <Textarea
            id={`${ids}-goal`}
            value={values.goal}
            maxLength={500}
            rows={2}
            placeholder={t('sprints.goalPlaceholder')}
            onChange={(e) => change({ goal: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-start`}>{t('sprints.startDate')}</Label>
            <Input
              id={`${ids}-start`}
              type="date"
              value={values.startDate}
              disabled={datesLocked}
              aria-invalid={errors.startDate ? true : undefined}
              onChange={(e) => change({ startDate: e.target.value })}
            />
            {message('startDate') && (
              <p className="text-destructive text-xs">{message('startDate')}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-end`}>{t('sprints.endDate')}</Label>
            <Input
              id={`${ids}-end`}
              type="date"
              value={values.endDate}
              disabled={datesLocked}
              aria-invalid={errors.endDate ? true : undefined}
              onChange={(e) => change({ endDate: e.target.value })}
            />
            {message('endDate') && <p className="text-destructive text-xs">{message('endDate')}</p>}
          </div>
        </div>
        {datesLocked && <p className="text-muted-foreground text-xs">{t('sprints.datesLocked')}</p>}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-capacity`}>{t('sprints.capacity')}</Label>
          <Input
            id={`${ids}-capacity`}
            value={values.capacityNote}
            maxLength={500}
            placeholder={t('sprints.capacityPlaceholder')}
            onChange={(e) => change({ capacityNote: e.target.value })}
          />
        </div>
        {mutation.error && <FormError error={mutation.error} />}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {t(editing ? 'common.save' : 'sprints.submitCreate')}
        </Button>
      </DialogFooter>
    </form>
  );
}

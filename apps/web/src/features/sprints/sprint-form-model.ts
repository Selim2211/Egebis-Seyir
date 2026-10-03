import { checkSprintDates, type SprintDatesError } from '@scrum/shared';

export interface SprintFormValues {
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  capacityNote: string;
}

export type SprintFormErrors = Partial<
  Record<'name' | 'startDate' | 'endDate', 'required' | SprintDatesError>
>;

const DAY_MS = 86_400_000;

const addDays = (day: string, days: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * Yeni sprint önerisi: adı sıradaki numara; başlangıcı son sprint'in ertesi günü (yoksa bugün),
 * bitişi Space'in sprint süresi (hafta) kadar sonrası.
 */
export function suggestSprint(
  existing: ReadonlyArray<{ endDate: string }>,
  today: string,
  weeks: number,
): SprintFormValues {
  const lastEnd = existing
    .map((s) => s.endDate)
    .sort()
    .at(-1);
  const startDate = lastEnd && lastEnd >= today ? addDays(lastEnd, 1) : today;
  return {
    name: `Sprint ${existing.length + 1}`,
    goal: '',
    startDate,
    endDate: addDays(startDate, weeks * 7 - 1),
    capacityNote: '',
  };
}

export function validateSprint(values: SprintFormValues): SprintFormErrors {
  const errors: SprintFormErrors = {};
  if (!values.name.trim()) errors.name = 'required';
  if (!values.startDate) errors.startDate = 'required';
  if (!values.endDate) errors.endDate = 'required';
  if (values.startDate && values.endDate) {
    const error = checkSprintDates(values.startDate, values.endDate);
    if (error) errors.endDate = error;
  }
  return errors;
}

export const toSprintBody = (values: SprintFormValues) => ({
  name: values.name.trim(),
  goal: values.goal.trim() || null,
  startDate: values.startDate,
  endDate: values.endDate,
  capacityNote: values.capacityNote.trim() || null,
});

import {
  type EstimationScale,
  MAX_READINESS_ITEMS,
  SPACE_COLORS,
  type SpaceIcon,
  SPRINT_LENGTH_WEEKS,
  UpdateSpaceRequestSchema,
} from '@scrum/shared';
import type { FieldError } from 'react-hook-form';

export interface SpaceFormValues {
  name: string;
  key: string;
  color: string;
  icon: SpaceIcon | null;
  description: string;
  isPrivate: boolean;
  scrumEnabled: boolean;
  sprintLengthWeeks: number;
  sprintGoalRequired: boolean;
  dodItems: string[];
  dorItems: string[];
  dodEnforced: boolean;
  estimationScale: EstimationScale;
}

export const EMPTY_SPACE: SpaceFormValues = {
  name: '',
  key: '',
  color: SPACE_COLORS[0],
  icon: null,
  description: '',
  isPrivate: false,
  scrumEnabled: true,
  sprintLengthWeeks: SPRINT_LENGTH_WEEKS.default,
  sprintGoalRequired: true,
  dodItems: [],
  dorItems: [],
  dodEnforced: false,
  estimationScale: 'FIBONACCI',
};

export type SpaceFormErrors = Partial<Record<keyof SpaceFormValues, FieldError>>;

/** Shared şemasıyla doğrular; alan → hata eşlemesi döner (boşsa geçerli). */
export function validateSpace(values: SpaceFormValues): SpaceFormErrors {
  const result = UpdateSpaceRequestSchema.safeParse({
    ...values,
    description: values.description.trim() || null,
  });
  if (result.success) return {};
  const errors: SpaceFormErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof SpaceFormValues;
    errors[field] ??= { type: issue.code };
  }
  return errors;
}

export function toSpaceBody(values: SpaceFormValues) {
  return {
    ...values,
    name: values.name.trim(),
    key: values.key.trim().toUpperCase(),
    description: values.description.trim() || null,
  };
}

/** Satırlardan madde listesi: boşlar atılır, tekrarlar teke iner (ilk görülen kalır), en çok 20. */
export function parseItems(text: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const line of text.split('\n')) {
    const item = line.trim();
    if (item && !seen.has(item)) {
      seen.add(item);
      items.push(item);
    }
  }
  return items.slice(0, MAX_READINESS_ITEMS);
}

import {
  type EstimationScale,
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

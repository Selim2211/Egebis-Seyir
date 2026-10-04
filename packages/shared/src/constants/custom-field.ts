export const CUSTOM_FIELD_TYPES = [
  'TEXT',
  'NUMBER',
  'DATE',
  'DROPDOWN',
  'MULTI_SELECT',
  'PERSON',
  'URL',
  'CHECKBOX',
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

/** Seçenek içeren alan türleri. */
export const OPTION_FIELD_TYPES: readonly CustomFieldType[] = ['DROPDOWN', 'MULTI_SELECT'];

/** Sınırlar (ADR-082). */
export const CUSTOM_FIELD_LIMITS = {
  fieldsPerSpace: 30,
  optionsPerField: 50,
  nameMax: 40,
  optionLabelMax: 40,
  textMax: 2000,
  urlMax: 2000,
  numberAbsMax: 1e12,
} as const;

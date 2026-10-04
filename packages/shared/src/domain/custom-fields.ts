import { CUSTOM_FIELD_LIMITS, type CustomFieldType } from '../constants/custom-field';

/** Özel alan değeri: metin/URL/tarih/liste/kişi → string, sayı → number, onay kutusu → boolean, çoklu → string[]. */
export type CustomFieldValue = string | number | boolean | string[];

export interface CustomFieldOption {
  id: string;
  label: string;
  color: string | null;
}

export interface CustomFieldDef {
  id: string;
  type: CustomFieldType;
  options: ReadonlyArray<{ id: string }>;
}

export type ValueCheck = { ok: true; value: CustomFieldValue | null } | { ok: false };

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidDateOnly(text: string): boolean {
  if (!DATE_ONLY.test(text)) return false;
  const date = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

function isHttpUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Değeri alan türüne göre doğrular ve normalleştirir. `null` (ve boş metin/boş çoklu seçim) değeri
 * temizler. Kişi alanında yalnızca biçim denetlenir; üyelik denetimi sunucuda yapılır.
 */
export function checkFieldValue(field: CustomFieldDef, value: unknown): ValueCheck {
  if (value === null) return { ok: true, value: null };
  const optionIds = new Set(field.options.map((o) => o.id));
  switch (field.type) {
    case 'TEXT': {
      if (typeof value !== 'string') return { ok: false };
      const text = value.trim();
      if (text.length > CUSTOM_FIELD_LIMITS.textMax) return { ok: false };
      return { ok: true, value: text === '' ? null : text };
    }
    case 'URL': {
      if (typeof value !== 'string') return { ok: false };
      const text = value.trim();
      if (text === '') return { ok: true, value: null };
      if (text.length > CUSTOM_FIELD_LIMITS.urlMax || !isHttpUrl(text)) return { ok: false };
      return { ok: true, value: text };
    }
    case 'NUMBER':
      if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false };
      if (Math.abs(value) > CUSTOM_FIELD_LIMITS.numberAbsMax) return { ok: false };
      return { ok: true, value };
    case 'DATE':
      if (typeof value !== 'string' || !isValidDateOnly(value)) return { ok: false };
      return { ok: true, value };
    case 'CHECKBOX':
      return typeof value === 'boolean' ? { ok: true, value } : { ok: false };
    case 'DROPDOWN':
      return typeof value === 'string' && optionIds.has(value)
        ? { ok: true, value }
        : { ok: false };
    case 'MULTI_SELECT': {
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !optionIds.has(v))) {
        return { ok: false };
      }
      const unique = [...new Set(value as string[])];
      return { ok: true, value: unique.length === 0 ? null : unique };
    }
    case 'PERSON':
      return typeof value === 'string' && UUID.test(value) ? { ok: true, value } : { ok: false };
  }
}

/** Alan değerini tablo/CSV için okunur metne çevirir (kişi adı çözümü çağıranda). */
export function formatFieldValue(
  field: { type: CustomFieldType; options: ReadonlyArray<{ id: string; label: string }> },
  value: CustomFieldValue | undefined,
  personName?: (id: string) => string | undefined,
): string {
  if (value === undefined || value === null) return '';
  const label = (id: string) => field.options.find((o) => o.id === id)?.label ?? '';
  switch (field.type) {
    case 'CHECKBOX':
      return value === true ? '✓' : '';
    case 'DROPDOWN':
      return label(String(value));
    case 'MULTI_SELECT':
      return Array.isArray(value)
        ? value
            .map(label)
            .filter((l) => l !== '')
            .join(', ')
        : '';
    case 'PERSON':
      return personName?.(String(value)) ?? '';
    default:
      return String(value);
  }
}

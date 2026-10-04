import { SAVED_VIEW_KEYS } from '@scrum/shared';
import { type ViewSearch, ViewSearchSchema } from './view-state';

/** Geçerli adres durumundan kaydedilecek ayarlar: `item` (açık panel) hariç, tanımlı alanlar. */
export function configFromSearch(search: ViewSearch): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const key of SAVED_VIEW_KEYS) {
    const value = search[key];
    if (value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    config[key] = value;
  }
  return config;
}

/**
 * Kayıtlı ayarı adres durumuna çevirir. Her anahtar ayrı doğrulanır: şema sonradan değişse de
 * (eski bir seçenek kalktıysa) geçerli kalanlar uygulanır, bozuk olan sessizce atlanır.
 */
export function searchFromConfig(config: Record<string, unknown>): Partial<ViewSearch> {
  const valid: Record<string, unknown> = {};
  for (const key of SAVED_VIEW_KEYS) {
    if (!(key in config)) continue;
    const parsed = ViewSearchSchema.shape[key].safeParse(config[key]);
    if (parsed.success && parsed.data !== undefined) valid[key] = parsed.data;
  }
  return ViewSearchSchema.parse(valid);
}

/** İki ayar aynı mı (anahtar sırasından bağımsız)? */
export function sameConfig(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const normalize = (config: Record<string, unknown>) =>
    JSON.stringify(SAVED_VIEW_KEYS.map((key) => [key, config[key] ?? null]));
  return normalize(a) === normalize(b);
}

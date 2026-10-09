import { z } from 'zod';

/** POST .../restore/space (multipart): yedek dosyası + bu alanlar (Faz 8.5, ADR-105). */
export const SpaceRestoreFieldsSchema = z.object({
  /** Yeni Space'in anahtarı (Space anahtarları workspace'te benzersizdir). */
  key: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/),
  name: z.string().trim().min(1).max(80).optional(),
});
export type SpaceRestoreFields = z.infer<typeof SpaceRestoreFieldsSchema>;

/** POST .../spaces/:spaceId/restore/sprint (multipart): yedek dosyası + bu alanlar. */
export const SprintRestoreFieldsSchema = z.object({
  /** Öğelerin açılacağı List. */
  listId: z.uuid(),
});
export type SprintRestoreFields = z.infer<typeof SprintRestoreFieldsSchema>;

export const RestoreResultSchema = z.object({
  spaceId: z.uuid(),
  sprintId: z.uuid().nullable(),
  /** Yedekteki satır sayıları (tablo adı → adet). */
  counts: z.record(z.string(), z.int()),
  /** Eşlenemeyip atlanan satırlar (ör. e-postası bu workspace'te olmayan atanan). */
  skipped: z.record(z.string(), z.int()),
});
export type RestoreResult = z.infer<typeof RestoreResultSchema>;

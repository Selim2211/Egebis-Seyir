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

/** Yedek şifreleme anahtarı (AES-256, ADR-171). Anahtarın kendisi yalnızca `reveal` ile, Super Admin'e döner. */
export const BackupKeyStatusSchema = z.object({
  configured: z.boolean(),
  /** Anahtarın 8 karakterlik parmak izi; anahtarı vermez. */
  fingerprint: z.string().nullable(),
  updatedAt: z.iso.datetime().nullable(),
});
export type BackupKeyStatus = z.infer<typeof BackupKeyStatusSchema>;

export const BackupKeyRevealSchema = z.object({ key: z.string() });
export type BackupKeyReveal = z.infer<typeof BackupKeyRevealSchema>;

/** PUT /backup-key — `key` boşsa sunucu rastgele 256 bit üretir; verilirse en az 16 karakter. */
export const SetBackupKeyRequestSchema = z.object({
  key: z.string().trim().min(16).max(128).optional(),
  /** Var olan anahtar değiştirilirken "eski yedekler etkilenebilir" uyarısı onaylandı. */
  acknowledgeOldBackups: z.boolean().default(false),
});
export type SetBackupKeyRequest = z.input<typeof SetBackupKeyRequestSchema>;

/** POST /spaces/:spaceId/rollback (multipart) — Projeyi yedeğin alındığı ana döndürür (ADR-173). */
export const SpaceRollbackFieldsSchema = z.object({
  /** Güvenlik onayı: Projenin anahtarı (ör. MOB) yazılmalıdır. */
  confirmKey: z.string().trim().min(1).max(20),
});
export type SpaceRollbackFields = z.infer<typeof SpaceRollbackFieldsSchema>;

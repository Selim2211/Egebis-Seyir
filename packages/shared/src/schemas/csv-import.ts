import { z } from 'zod';
import { IMPORT_LIMITS } from '../domain/csv-import';

const Csv = z.string().min(1).max(IMPORT_LIMITS.maxBytes);
const Mapping = z.record(z.string(), z.string().nullable());

/** GET .../lists/:listId/export — ilk satır başlık. */
export const ExportResponseSchema = z.object({
  rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
});
export type ExportResponse = z.infer<typeof ExportResponseSchema>;

/** POST .../lists/:listId/import/preview — eşleme verilmezse başlıklardan önerilir. */
export const ImportPreviewRequestSchema = z.object({
  csv: Csv,
  mapping: Mapping.optional(),
});
export type ImportPreviewRequest = z.infer<typeof ImportPreviewRequestSchema>;

/** POST .../lists/:listId/import */
export const ImportRequestSchema = z.object({ csv: Csv, mapping: Mapping });
export type ImportRequest = z.infer<typeof ImportRequestSchema>;

export const ImportIssueSchema = z.object({
  /** Dosyadaki satır numarası (başlık 1, ilk veri satırı 2). */
  row: z.int(),
  field: z.string().nullable(),
  code: z.string(),
  detail: z.string().nullable(),
});
export type ImportIssue = z.infer<typeof ImportIssueSchema>;

export const ImportPreviewSchema = z.object({
  headers: z.array(z.string()),
  mapping: Mapping,
  totalRows: z.int(),
  /** Hatasız (içe aktarılabilir) satır sayısı. */
  validRows: z.int(),
  tooManyRows: z.boolean(),
  sample: z.array(z.array(z.string())),
  issues: z.array(ImportIssueSchema),
});
export type ImportPreview = z.infer<typeof ImportPreviewSchema>;

export const ImportResultSchema = z.object({
  created: z.int(),
  updated: z.int(),
  skipped: z.int(),
  issues: z.array(ImportIssueSchema),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;

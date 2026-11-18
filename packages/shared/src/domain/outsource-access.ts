import { z } from 'zod';
import { SPACE_PERMISSIONS as S } from '../permissions/permissions';

/**
 * Dış kaynağın Proje bazlı, kişiye özel yetkisi (ADR-172). Rol bazlı değildir: Super Admin kişiyi
 * Projelere atar; her Projede o Projenin Scrum Master'ı (ya da Super Admin) alan bazında
 * Yok / Okuma / Yazma belirler. Hiçbir Projeye atanmayan dış kaynak hiçbir Proje görmez.
 */
export const OUTSOURCE_AREAS = ['items', 'comments', 'docs', 'videos', 'reports'] as const;
export type OutsourceArea = (typeof OUTSOURCE_AREAS)[number];

export const ACCESS_LEVELS = ['NONE', 'READ', 'WRITE'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const OutsourceAccessSchema = z.object({
  /** İş öğeleri (Epik/Task/Sub-task/Bug), Backlog ve Sprint; en az Okuma (Proje görünür). */
  items: z.enum(ACCESS_LEVELS),
  /** Yorumlar: Yazma = yorum yapabilir; Okuma = yalnızca öğelerle birlikte görür. */
  comments: z.enum(ACCESS_LEVELS),
  docs: z.enum(ACCESS_LEVELS),
  videos: z.enum(ACCESS_LEVELS),
  /** Raporlar yalnızca görüntülenir; Yazma Okuma ile aynıdır. */
  reports: z.enum(ACCESS_LEVELS),
});
export type OutsourceAccess = z.infer<typeof OutsourceAccessSchema>;

/** Yeni atanan dış kaynağın başlangıç yetkisi: yalnızca iş öğelerini okur. */
export const DEFAULT_OUTSOURCE_ACCESS: OutsourceAccess = {
  items: 'READ',
  comments: 'NONE',
  docs: 'NONE',
  videos: 'NONE',
  reports: 'NONE',
};

/** Kayıtlı (eksik/bozuk olabilecek) değeri geçerli bir yetkiye çevirir; geçersizse varsayılan. */
export function normalizeOutsourceAccess(value: unknown): OutsourceAccess {
  const parsed = OutsourceAccessSchema.safeParse({
    ...DEFAULT_OUTSOURCE_ACCESS,
    ...(value as object),
  });
  const access = parsed.success ? parsed.data : DEFAULT_OUTSOURCE_ACCESS;
  return { ...access, items: access.items === 'NONE' ? 'READ' : access.items };
}

/** Alan düzeylerinden Proje izinleri. Yönetici (Proje Yöneticisi) izinleri hiçbir koşulda gelmez. */
export function outsourceAccessPermissions(input: unknown): readonly string[] {
  const a = normalizeOutsourceAccess(input);
  const out: string[] = [S.SPACE_VIEW];
  if (a.items === 'WRITE') {
    out.push(S.WORK_ITEM_WRITE, S.WORK_ITEM_STATUS_OWN, S.ESTIMATE_WRITE, S.BUG_REPORT);
  }
  if (a.comments === 'WRITE') out.push(S.COMMENT_WRITE);
  if (a.docs !== 'NONE') out.push(S.DOC_VIEW);
  if (a.docs === 'WRITE') out.push(S.DOC_CREATE, S.DOC_EDIT);
  if (a.videos !== 'NONE') out.push(S.VIDEO_VIEW);
  if (a.videos === 'WRITE') out.push(S.VIDEO_CREATE, S.VIDEO_EDIT);
  if (a.reports !== 'NONE') out.push(S.REPORT_VIEW);
  return out;
}

/** GET /spaces/:spaceId/outsource-access — Projeye atanmış dış kaynaklar ve kişisel yetkileri. */
export const OutsourceAccessPersonSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  email: z.string(),
  avatarVersion: z.string().nullable(),
  /** Hesap bitiş anı ve kilit durumu (ADR-169). */
  expiresAt: z.iso.datetime().nullable(),
  locked: z.boolean(),
  access: OutsourceAccessSchema,
});
export type OutsourceAccessPerson = z.infer<typeof OutsourceAccessPersonSchema>;

export const OutsourceAccessResponseSchema = z.object({
  people: z.array(OutsourceAccessPersonSchema),
});
export type OutsourceAccessResponse = z.infer<typeof OutsourceAccessResponseSchema>;

/** PUT /spaces/:spaceId/outsource-access/:userId */
export const PutOutsourceAccessRequestSchema = z.object({ access: OutsourceAccessSchema });
export type PutOutsourceAccessRequest = z.infer<typeof PutOutsourceAccessRequestSchema>;

import { z } from 'zod';
import { NOTIFICATION_TYPES } from '../domain/notifications';

export const NotificationTypeSchema = z.enum(NOTIFICATION_TYPES);

export const NotificationSchema = z.object({
  id: z.uuid(),
  type: NotificationTypeSchema,
  at: z.iso.datetime(),
  read: z.boolean(),
  actor: z
    .object({ id: z.uuid(), name: z.string(), avatarVersion: z.string().nullable() })
    .nullable(),
  /** Öğeyle ilgili bildirimlerde okunabilir kimlik ve başlık (anlık görüntü). */
  item: z.object({ key: z.string(), title: z.string() }).nullable(),
  /** Doküman sayfası bildirimleri (yorumda etiketlenme). */
  doc: z.object({ id: z.uuid(), title: z.string(), spaceId: z.uuid() }).nullable(),
  /** Ek bilgi: durum değişikliğinde yeni durum adı. */
  detail: z.string().nullable(),
  /** Sprint bildirimlerinde sprint ve Space. */
  sprint: z.object({ id: z.uuid(), name: z.string(), spaceId: z.uuid() }).nullable(),
});
export type Notification = z.infer<typeof NotificationSchema>;

/** GET /api/workspaces/:wid/notifications?unread=true&before=ISO — en yeni önce, 30'ar kayıt. */
export const NotificationsResponseSchema = z.object({
  items: z.array(NotificationSchema),
  unreadCount: z.int(),
  hasMore: z.boolean(),
});
export type NotificationsResponse = z.infer<typeof NotificationsResponseSchema>;

export const NOTIFICATIONS_PAGE_SIZE = 30;

export const NotificationPreferenceSchema = z.object({
  type: NotificationTypeSchema,
  inApp: z.boolean(),
  email: z.boolean(),
});

/** GET|PUT /api/workspaces/:wid/notifications/preferences — tüm türler sırayla. */
export const NotificationPreferencesSchema = z.object({
  preferences: z.array(NotificationPreferenceSchema).max(NOTIFICATION_TYPES.length),
});
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;

/** GET /api/workspaces/:wid/notifications/unread-count — rozet için hafif yoklama. */
export const UnreadCountSchema = z.object({ unreadCount: z.int() });
export type UnreadCount = z.infer<typeof UnreadCountSchema>;

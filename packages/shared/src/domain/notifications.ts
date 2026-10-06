export const NOTIFICATION_TYPES = [
  'ASSIGNED',
  'MENTIONED',
  'COMMENTED',
  'STATUS_CHANGED',
  'SPRINT_STARTED',
  'SPRINT_COMPLETED',
  'AUTOMATION',
  'REMINDER',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CHANNELS = ['inApp', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface ChannelPreference {
  type: NotificationType;
  inApp: boolean;
  email: boolean;
}

/** Tercih kaydı yoksa her kanal açıktır (ADR-066). */
export function channelEnabled(
  preferences: ReadonlyArray<ChannelPreference>,
  type: NotificationType,
  channel: NotificationChannel,
): boolean {
  return preferences.find((p) => p.type === type)?.[channel] ?? true;
}

/**
 * Bildirim alıcıları: tekrarsız, eylemi yapan kişi hariç (kendini bilgilendirme), yalnızca
 * Space'i görebilenler. Sıra ilk görülene göre korunur.
 */
export function notificationRecipients(
  candidates: ReadonlyArray<string>,
  actorId: string | null,
  visible: ReadonlySet<string>,
): string[] {
  return [...new Set(candidates)].filter((id) => id !== actorId && visible.has(id));
}

/** Tür sırasıyla tam tercih listesi: kayıtlı olmayan türler varsayılan (açık) gelir. */
export function completePreferences(stored: ReadonlyArray<ChannelPreference>): ChannelPreference[] {
  return NOTIFICATION_TYPES.map(
    (type) => stored.find((p) => p.type === type) ?? { type, inApp: true, email: true },
  );
}

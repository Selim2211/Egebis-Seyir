import type { Notification } from '@scrum/shared';
import type { TFunction } from 'i18next';

/**
 * Bildirim cümlesi (yapılan eylemi yapan kişi dahil). Metin her türe özgü çeviri anahtarından gelir;
 * öğe veya sprint bilgisi eksikse (silinmiş) boş değer yerine kısa bir yedek kullanılır.
 */
export function describeNotification(n: Notification, t: TFunction): string {
  return t(`notifications.text.${n.type}`, {
    actor: n.actor?.name ?? t('notifications.someone'),
    key: n.item?.key ?? '',
    title: n.item?.title ?? '',
    sprint: n.sprint?.name ?? '',
    detail: n.detail ?? '',
  });
}

/** Bildirimin açacağı adres; hedefi olmayan bildirim null döner. */
export function notificationTarget(
  n: Notification,
):
  | { to: '/items/$key'; params: { key: string } }
  | { to: '/spaces/$spaceId/review/$sprintId'; params: { spaceId: string; sprintId: string } }
  | null {
  if (n.item) return { to: '/items/$key', params: { key: n.item.key } };
  if (n.sprint) {
    return {
      to: '/spaces/$spaceId/review/$sprintId',
      params: { spaceId: n.sprint.spaceId, sprintId: n.sprint.id },
    };
  }
  return null;
}

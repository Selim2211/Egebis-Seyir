import type { Locale, NotificationType } from '@scrum/shared';
import { escapeHtml, layout, type MailMessage } from './templates';

export interface NotificationMailInput {
  to: string;
  locale: Locale;
  type: NotificationType;
  actorName: string;
  /** Öğeyle ilgili olaylar. */
  item?: { key: string; title: string };
  sprintName?: string;
  /** Durum değişikliğinde yeni durum adı. */
  detail?: string;
  url: string;
}

interface Copy {
  subject: string;
  line: string;
  action: string;
}

/** Tür ve dile göre konu, cümle ve düğme metni. Biçimlendirme `layout` içindedir. */
function copy(p: NotificationMailInput): Copy {
  const who = p.actorName;
  const key = p.item?.key ?? '';
  const title = p.item?.title ?? '';
  const sprint = p.sprintName ?? '';
  const detail = p.detail ?? '';
  if (p.locale === 'en') {
    switch (p.type) {
      case 'ASSIGNED':
        return {
          subject: `${who} assigned you ${key}`,
          line: `${who} assigned you “${title}” (${key}).`,
          action: 'Open item',
        };
      case 'MENTIONED':
        return {
          subject: `${who} mentioned you in ${key}`,
          line: `${who} mentioned you in a comment on “${title}” (${key}).`,
          action: 'Open comment',
        };
      case 'COMMENTED':
        return {
          subject: `New comment on ${key}`,
          line: `${who} commented on “${title}” (${key}).`,
          action: 'Open item',
        };
      case 'STATUS_CHANGED':
        return {
          subject: `${key} moved to ${detail}`,
          line: `${who} moved “${title}” (${key}) to ${detail}.`,
          action: 'Open item',
        };
      case 'SPRINT_STARTED':
        return {
          subject: `${sprint} started`,
          line: `${who} started ${sprint}.`,
          action: 'Open review',
        };
      case 'SPRINT_COMPLETED':
        return {
          subject: `${sprint} completed`,
          line: `${who} completed ${sprint}.`,
          action: 'Open review',
        };
    }
  }
  switch (p.type) {
    case 'ASSIGNED':
      return {
        subject: `${who} sana ${key} görevini atadı`,
        line: `${who}, “${title}” (${key}) görevini sana atadı.`,
        action: 'Görevi aç',
      };
    case 'MENTIONED':
      return {
        subject: `${who} seni ${key} içinde etiketledi`,
        line: `${who}, “${title}” (${key}) görevindeki yorumunda seni etiketledi.`,
        action: 'Yorumu aç',
      };
    case 'COMMENTED':
      return {
        subject: `${key} için yeni yorum`,
        line: `${who}, “${title}” (${key}) görevine yorum yazdı.`,
        action: 'Görevi aç',
      };
    case 'STATUS_CHANGED':
      return {
        subject: `${key} durumu: ${detail}`,
        line: `${who}, “${title}” (${key}) görevinin durumunu “${detail}” yaptı.`,
        action: 'Görevi aç',
      };
    case 'SPRINT_STARTED':
      return {
        subject: `${sprint} başladı`,
        line: `${who}, ${sprint} sprint'ini başlattı.`,
        action: 'Özeti aç',
      };
    case 'SPRINT_COMPLETED':
      return {
        subject: `${sprint} tamamlandı`,
        line: `${who}, ${sprint} sprint'ini tamamladı.`,
        action: 'Özeti aç',
      };
  }
}

/** Uygulama içi bildirimin anında e-posta karşılığı (ADR-066). */
export function notificationMail(p: NotificationMailInput): MailMessage {
  const c = copy(p);
  const footer =
    p.locale === 'en'
      ? 'You can turn these emails off per notification type in Settings › Notifications.'
      : 'Bu e-postaları Ayarlar › Bildirimler bölümünden bildirim türü bazında kapatabilirsin.';
  return {
    to: p.to,
    subject: c.subject,
    text: `${c.line}\n\n${c.action}: ${p.url}\n\n${footer}`,
    html: layout(c.subject, [escapeHtml(c.line)], { label: c.action, url: p.url }, footer),
  };
}

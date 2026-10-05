import type { WebhookFormat } from '@scrum/shared';

/** Webhook olay yükü (ADR-087). Genel biçimde olduğu gibi gönderilir. */
export interface WebhookPayload {
  event: string;
  workspaceId: string;
  space: { id: string; key: string; name: string };
  actor: { id: string; name: string; locale?: string } | null;
  item?: {
    id: string;
    key: string;
    title: string;
    type: string;
    status: string;
    priority: string;
  };
  commentId?: string;
  sprint?: { id: string; name: string; goal: string | null };
  message?: string;
  /** Olayın uygulamadaki adresi (varsa). */
  url?: string;
}

type Locale = 'tr' | 'en';

/** Sohbet mesajı: başlık satırı ve isteğe bağlı ayrıntı. Dil, olayı yapan kişinin diline göredir. */
export function describeEvent(payload: WebhookPayload): { title: string; detail: string | null } {
  const locale: Locale = payload.actor?.locale === 'en' ? 'en' : 'tr';
  const who = payload.actor?.name ?? (locale === 'en' ? 'Someone' : 'Biri');
  const item = payload.item;
  const sprint = payload.sprint;
  const space = payload.space.key;
  const tr = locale === 'tr';
  switch (payload.event) {
    case 'item.created':
      return {
        title: tr ? `${who} ${item?.key} oluşturdu` : `${who} created ${item?.key}`,
        detail: item ? `[${space}] ${item.title}` : null,
      };
    case 'item.status_changed':
      return {
        title: tr
          ? `${who}, ${item?.key} durumunu “${item?.status}” yaptı`
          : `${who} moved ${item?.key} to “${item?.status}”`,
        detail: item ? `[${space}] ${item.title}` : null,
      };
    case 'item.priority_changed':
      return {
        title: tr
          ? `${who}, ${item?.key} önceliğini değiştirdi (${item?.priority})`
          : `${who} changed the priority of ${item?.key} (${item?.priority})`,
        detail: item ? `[${space}] ${item.title}` : null,
      };
    case 'comment.created':
      return {
        title: tr ? `${who}, ${item?.key} için yorum yazdı` : `${who} commented on ${item?.key}`,
        detail: item ? `[${space}] ${item.title}` : null,
      };
    case 'sprint.started':
      return {
        title: tr
          ? `${who}, ${sprint?.name} sprint’ini başlattı`
          : `${who} started ${sprint?.name}`,
        detail: sprint?.goal ? `${tr ? 'Hedef' : 'Goal'}: ${sprint.goal}` : `[${space}]`,
      };
    case 'sprint.completed':
      return {
        title: tr
          ? `${who}, ${sprint?.name} sprint’ini tamamladı`
          : `${who} completed ${sprint?.name}`,
        detail: `[${space}]`,
      };
    default:
      return { title: payload.message ?? payload.event, detail: `[${space}]` };
  }
}

/** Slack gelen webhook'u: tek `text` alanı (mrkdwn bağlantı sözdizimi). */
function slack(payload: WebhookPayload): unknown {
  const { title, detail } = describeEvent(payload);
  const head = payload.url ? `<${payload.url}|${title}>` : title;
  return { text: detail ? `${head}\n${detail}` : head };
}

/** Teams (Workflows) gelen webhook'u: Adaptive Card içeren mesaj. */
function teams(payload: WebhookPayload): unknown {
  const { title, detail } = describeEvent(payload);
  const body: unknown[] = [{ type: 'TextBlock', text: title, weight: 'Bolder', wrap: true }];
  if (detail) body.push({ type: 'TextBlock', text: detail, wrap: true, isSubtle: true });
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body,
          ...(payload.url && {
            actions: [{ type: 'Action.OpenUrl', title: 'Egebis Seyir', url: payload.url }],
          }),
        },
      },
    ],
  };
}

/** Biçime göre istek gövdesi (ADR-087/088). GENERIC olduğu gibi, Slack/Teams sohbet mesajı. */
export function buildWebhookRequest(
  format: WebhookFormat,
  payload: WebhookPayload,
): { body: unknown } {
  if (format === 'SLACK') return { body: slack(payload) };
  if (format === 'TEAMS') return { body: teams(payload) };
  return { body: payload };
}

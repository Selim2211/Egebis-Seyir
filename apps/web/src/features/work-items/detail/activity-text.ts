import {
  RECURRENCE_FREQUENCIES,
  type ActivityChange,
  type ActivityEvent,
  type RecurrenceFrequency,
} from '@scrum/shared';
import type { TFunction } from 'i18next';

/** Çevirisi olan alan adları; olmayan alan ham adıyla gösterilir. */
export const ACTIVITY_FIELDS = [
  'title',
  'priority',
  'statusId',
  'assigneeIds',
  'labelIds',
  'startDate',
  'dueDate',
  'points',
  'estimateHours',
  'parentId',
  'completedAt',
  'severity',
  'stepsToReproduce',
  'expectedResult',
  'actualResult',
  'environment',
  'foundInVersion',
  'goal',
  'tshirtSize',
  'color',
  'description',
  'listId',
  'spaceId',
  'bulk',
  'recurrence',
] as const;
export type ActivityField = (typeof ACTIVITY_FIELDS)[number];
const isField = (field: string): field is ActivityField =>
  (ACTIVITY_FIELDS as readonly string[]).includes(field);

const text = (value: string | string[] | null, empty: string) =>
  value === null || (Array.isArray(value) && value.length === 0)
    ? empty
    : Array.isArray(value)
      ? value.join(', ')
      : value;

/** Tek alan değişikliğini okunur cümleye çevirir. */
function describeChange(change: ActivityChange, t: TFunction): string | null {
  // Toplu işlem işareti ve tamamlanma tarihi ayrı cümle gerektirmez (durum değişikliğiyle birlikte gelir).
  if (change.field === 'bulk' || change.field === 'completedAt') return null;
  const none = t('activity.none');
  const from = text(change.from, none);
  const to = text(change.to, none);
  if (change.field === 'priority') {
    const name = (v: string | string[] | null) =>
      v === 'URGENT' || v === 'HIGH' || v === 'NORMAL' || v === 'LOW' ? t(`priority.${v}`) : none;
    return t('activity.changed', {
      field: t('activity.fields.priority'),
      from: name(change.from),
      to: name(change.to),
    });
  }
  if (change.field === 'description') return t('activity.descriptionEdited');
  if (change.field === 'recurrence') {
    const name = (v: string | string[] | null) => {
      const [freq, interval] = typeof v === 'string' ? v.split(':') : [];
      return freq && (RECURRENCE_FREQUENCIES as readonly string[]).includes(freq)
        ? t('recurrence.summary', {
            count: Number(interval),
            context: freq as RecurrenceFrequency,
          })
        : none;
    };
    return t('activity.changed', {
      field: t('activity.fields.recurrence'),
      from: name(change.from),
      to: name(change.to),
    });
  }
  if (change.field === 'assigneeIds' || change.field === 'labelIds') {
    const before = new Set(Array.isArray(change.from) ? change.from : []);
    const after = new Set(Array.isArray(change.to) ? change.to : []);
    const added = [...after].filter((v) => !before.has(v));
    const removed = [...before].filter((v) => !after.has(v));
    const key = change.field === 'assigneeIds' ? 'assignees' : 'labels';
    return [
      added.length ? t(`activity.${key}Added`, { names: added.join(', ') }) : null,
      removed.length ? t(`activity.${key}Removed`, { names: removed.join(', ') }) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  const field = isField(change.field) ? t(`activity.fields.${change.field}`) : change.field;
  return t('activity.changed', { field, from, to });
}

/** Olayı bir veya birkaç cümleye çevirir (özne — aktör — arayüzde ayrı gösterilir). */
export function describeEvent(event: ActivityEvent, t: TFunction): string[] {
  const detail = event.detail ?? '';
  switch (event.action) {
    case 'item.created':
      return [t('activity.created')];
    case 'item.updated': {
      const lines = event.changes.map((c) => describeChange(c, t)).filter((l): l is string => !!l);
      return lines.length > 0 ? lines : [t('activity.updated')];
    }
    case 'item.moved':
      return [
        t('activity.moved', {
          to: event.changes.find((c) => c.field === 'listId')?.to ?? detail,
        }),
      ];
    case 'item.copied':
      return [t('activity.copied', { key: detail })];
    case 'item.recurred':
      return [t('activity.recurred', { key: detail })];
    case 'item.archived':
      return [t('activity.archived')];
    case 'item.unarchived':
      return [t('activity.unarchived')];
    case 'item.trashed':
      return [t('activity.trashed')];
    case 'item.restored':
      return [t('activity.restored')];
    case 'item.git_linked':
      return [t('activity.gitLinked', { detail })];
    case 'item.git_updated':
      return [t('activity.gitUpdated', { detail })];
    case 'item.commented':
      return [t('activity.commented')];
    case 'item.comment_edited':
      return [t('activity.commentEdited')];
    case 'item.comment_deleted':
      return [t('activity.commentDeleted')];
    case 'item.link_added':
      return [t('activity.linkAdded')];
    case 'item.link_removed':
      return [t('activity.linkRemoved')];
    case 'item.checklist_added':
      return [t('activity.checklistAdded', { name: detail })];
    case 'item.checklist_removed':
      return [t('activity.checklistRemoved', { name: detail })];
    case 'item.split':
      return [t('activity.split')];
    case 'item.attachment_added':
      return [t('activity.attachmentAdded', { name: detail })];
    case 'item.attachment_removed':
      return [t('activity.attachmentRemoved', { name: detail })];
    default:
      return [event.action];
  }
}

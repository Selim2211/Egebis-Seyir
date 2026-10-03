import type { Notification } from '@scrum/shared';
import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { describeNotification, notificationTarget } from './notification-text';

/** Çeviri yerine anahtarı ve parametreleri döndüren sahte `t`. */
const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key) as unknown as TFunction;

const base: Notification = {
  id: '00000000-0000-7000-8000-000000000001',
  type: 'ASSIGNED',
  at: '2026-10-03T10:00:00.000Z',
  read: false,
  actor: { id: '00000000-0000-7000-8000-000000000002', name: 'Zeynep', avatarVersion: null },
  item: { key: 'MOB-1', title: 'Ödeme' },
  detail: null,
  sprint: null,
};

describe('describeNotification', () => {
  it('türe özgü anahtarı ve olay bilgilerini kullanır', () => {
    expect(describeNotification(base, t)).toBe(
      'notifications.text.ASSIGNED{"actor":"Zeynep","key":"MOB-1","title":"Ödeme","sprint":"","detail":""}',
    );
  });

  it('durum değişikliğinde yeni durum adı iletilir', () => {
    const text = describeNotification(
      { ...base, type: 'STATUS_CHANGED', detail: 'Devam ediyor' },
      t,
    );
    expect(text).toContain('"detail":"Devam ediyor"');
  });

  it('eylemi yapan kişi silinmişse yedek metin kullanılır', () => {
    expect(describeNotification({ ...base, actor: null }, t)).toContain(
      '"actor":"notifications.someone"',
    );
  });
});

describe('notificationTarget', () => {
  it('öğe bildirimi öğeyi, sprint bildirimi Review sayfasını açar', () => {
    expect(notificationTarget(base)).toEqual({ to: '/items/$key', params: { key: 'MOB-1' } });
    expect(
      notificationTarget({
        ...base,
        type: 'SPRINT_STARTED',
        item: null,
        sprint: { id: 'sp', name: 'Sprint 1', spaceId: 'sx' },
      }),
    ).toEqual({
      to: '/spaces/$spaceId/review/$sprintId',
      params: { spaceId: 'sx', sprintId: 'sp' },
    });
  });

  it('hedefi olmayan bildirim null', () => {
    expect(notificationTarget({ ...base, item: null })).toBeNull();
  });
});

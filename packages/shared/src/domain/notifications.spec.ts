import { describe, expect, it } from 'vitest';
import {
  channelEnabled,
  completePreferences,
  NOTIFICATION_TYPES,
  notificationRecipients,
} from './notifications';

describe('channelEnabled', () => {
  const prefs = [{ type: 'COMMENTED' as const, inApp: true, email: false }];

  it('kayıt yoksa her kanal açık', () => {
    expect(channelEnabled([], 'ASSIGNED', 'email')).toBe(true);
    expect(channelEnabled(prefs, 'ASSIGNED', 'inApp')).toBe(true);
  });

  it('kayıtlı tercihi uygular', () => {
    expect(channelEnabled(prefs, 'COMMENTED', 'email')).toBe(false);
    expect(channelEnabled(prefs, 'COMMENTED', 'inApp')).toBe(true);
  });
});

describe('notificationRecipients', () => {
  const visible = new Set(['a', 'b', 'c']);

  it('eylemi yapanı ve görmeyenleri atar, tekrarı teke indirir', () => {
    expect(notificationRecipients(['a', 'b', 'b', 'x', 'c'], 'a', visible)).toEqual(['b', 'c']);
  });

  it('eylem sahibi yoksa (sistem) kimse atılmaz', () => {
    expect(notificationRecipients(['a'], null, visible)).toEqual(['a']);
  });
});

describe('completePreferences', () => {
  it('tüm türleri sırayla döner; eksikler varsayılan', () => {
    const all = completePreferences([{ type: 'MENTIONED', inApp: false, email: true }]);
    expect(all.map((p) => p.type)).toEqual([...NOTIFICATION_TYPES]);
    expect(all.find((p) => p.type === 'MENTIONED')).toEqual({
      type: 'MENTIONED',
      inApp: false,
      email: true,
    });
    expect(all.find((p) => p.type === 'ASSIGNED')).toEqual({
      type: 'ASSIGNED',
      inApp: true,
      email: true,
    });
  });
});

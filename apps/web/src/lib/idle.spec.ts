import { describe, expect, it, vi } from 'vitest';
import { __setLastActivity, IDLE_AFTER_MS, isIdle, markActive, onWake, pollEvery } from './idle';

describe('idle', () => {
  it('etkin kullanıcıda aralık değişmez, boşta en az 2 dakikaya çıkar', () => {
    __setLastActivity(Date.now());
    const poll = pollEvery(4_000);
    expect(poll()).toBe(4_000);
    __setLastActivity(Date.now() - IDLE_AFTER_MS - 1);
    expect(isIdle()).toBe(true);
    expect(poll()).toBe(120_000);
    expect(pollEvery(300_000)()).toBe(300_000);
  });

  it('boştan dönüşte uyanma dinleyicisi bir kez çağrılır', () => {
    const fn = vi.fn();
    const off = onWake(fn);
    __setLastActivity(Date.now() - IDLE_AFTER_MS - 1);
    expect(isIdle()).toBe(true);
    markActive();
    markActive();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(isIdle()).toBe(false);
    off();
  });
});

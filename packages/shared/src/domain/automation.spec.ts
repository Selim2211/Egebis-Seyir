import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_MAX_DEPTH,
  checkAutomationLoop,
  matchesConditions,
  matchesTrigger,
} from './automation';

const subject = {
  type: 'TASK' as const,
  priority: 'HIGH' as const,
  labelIds: ['a'],
  assigneeCount: 0,
};

describe('matchesTrigger', () => {
  it('tür aynı olmalı', () => {
    expect(matchesTrigger({ type: 'ITEM_CREATED' }, { type: 'ITEM_CREATED' })).toBe(true);
    expect(
      matchesTrigger({ type: 'ITEM_CREATED' }, { type: 'STATUS_CHANGED', toStatusId: 's' }),
    ).toBe(false);
  });
  it('durum hedefi belirtilmişse yalnızca o duruma geçişte, null ise hepsinde', () => {
    const event = { type: 'STATUS_CHANGED', toStatusId: 's1' } as const;
    expect(matchesTrigger({ type: 'STATUS_CHANGED', toStatusId: 's1' }, event)).toBe(true);
    expect(matchesTrigger({ type: 'STATUS_CHANGED', toStatusId: 's2' }, event)).toBe(false);
    expect(matchesTrigger({ type: 'STATUS_CHANGED', toStatusId: null }, event)).toBe(true);
  });
  it('öncelik hedefi aynı şekilde çalışır', () => {
    const event = { type: 'PRIORITY_CHANGED', to: 'URGENT' } as const;
    expect(matchesTrigger({ type: 'PRIORITY_CHANGED', to: 'URGENT' }, event)).toBe(true);
    expect(matchesTrigger({ type: 'PRIORITY_CHANGED', to: 'LOW' }, event)).toBe(false);
    expect(matchesTrigger({ type: 'PRIORITY_CHANGED', to: null }, event)).toBe(true);
  });
});

describe('matchesConditions', () => {
  it('koşul yoksa her işle eşleşir', () => {
    expect(matchesConditions({}, subject)).toBe(true);
    expect(matchesConditions({ types: [], priorities: [], labelIds: [] }, subject)).toBe(true);
  });
  it('tip, öncelik ve etiket kısıtları VE ile uygulanır', () => {
    expect(matchesConditions({ types: ['TASK', 'BUG'] }, subject)).toBe(true);
    expect(matchesConditions({ types: ['STORY'] }, subject)).toBe(false);
    expect(matchesConditions({ priorities: ['LOW'] }, subject)).toBe(false);
    expect(matchesConditions({ labelIds: ['a', 'b'] }, subject)).toBe(true);
    expect(matchesConditions({ labelIds: ['b'] }, subject)).toBe(false);
    expect(matchesConditions({ types: ['TASK'], priorities: ['LOW'] }, subject)).toBe(false);
  });
  it('atanmamış koşulu', () => {
    expect(matchesConditions({ unassigned: true }, subject)).toBe(true);
    expect(matchesConditions({ unassigned: true }, { ...subject, assigneeCount: 1 })).toBe(false);
  });
});

describe('checkAutomationLoop', () => {
  it('aynı kural zincirde tekrar çalışamaz', () => {
    expect(checkAutomationLoop([], 'a')).toEqual({ ok: true });
    expect(checkAutomationLoop(['a'], 'a')).toEqual({ ok: false, reason: 'REPEAT' });
    expect(checkAutomationLoop(['a'], 'b')).toEqual({ ok: true });
  });
  it('zincir derinliği sınırlıdır', () => {
    const chain = Array.from({ length: AUTOMATION_MAX_DEPTH }, (_, i) => `x${i}`);
    expect(checkAutomationLoop(chain, 'new')).toEqual({ ok: false, reason: 'DEPTH' });
    expect(checkAutomationLoop(chain.slice(1), 'new')).toEqual({ ok: true });
  });
});

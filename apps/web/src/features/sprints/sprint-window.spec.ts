import { describe, expect, it } from 'vitest';
import { quickSprintTargets } from './sprint-window';

const sp = (id: string, status = 'PLANNED') => ({ id, status });
const all = [sp('a'), sp('b'), sp('c', 'ACTIVE'), sp('d'), sp('e'), sp('f')];
const ids = (list: Array<{ id: string }>) => list.map((s) => s.id);

describe('quickSprintTargets', () => {
  it('from a source sprint: 1 previous and 2 next, source excluded', () => {
    expect(ids(quickSprintTargets(all, 'c'))).toEqual(['b', 'd', 'e']);
    expect(ids(quickSprintTargets(all, 'a'))).toEqual(['b', 'c']);
    expect(ids(quickSprintTargets(all, 'f'))).toEqual(['e']);
  });

  it('from the backlog: active sprint first, then the next two', () => {
    expect(ids(quickSprintTargets(all, null))).toEqual(['c', 'd', 'e']);
  });

  it('without an active sprint starts from the first one', () => {
    expect(ids(quickSprintTargets([sp('x'), sp('y'), sp('z'), sp('w')], null))).toEqual([
      'x',
      'y',
      'z',
    ]);
  });

  it('handles empty and tiny lists', () => {
    expect(quickSprintTargets([], null)).toEqual([]);
    expect(ids(quickSprintTargets([sp('only')], 'only'))).toEqual([]);
  });
});

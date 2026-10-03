import { describe, expect, it } from 'vitest';
import { epicStats } from './work-item-progress';

describe('Epic özeti (brief §5.7)', () => {
  it('alt öğe yoksa her şey sıfırdır', () => {
    expect(epicStats([])).toEqual({
      points: 0,
      donePoints: 0,
      itemCount: 0,
      doneCount: 0,
      activeCount: 0,
      unestimatedCount: 0,
    });
  });

  it('puan ve adetleri kategoriye göre toplar', () => {
    const stats = epicStats([
      { points: 5, category: 'DONE' },
      { points: 3, category: 'ACTIVE' },
      { points: 8, category: 'NOT_STARTED' },
      { points: null, category: 'DONE' },
    ]);
    expect(stats).toEqual({
      points: 16,
      donePoints: 5,
      itemCount: 4,
      doneCount: 2,
      activeCount: 1,
      unestimatedCount: 1,
    });
  });
});

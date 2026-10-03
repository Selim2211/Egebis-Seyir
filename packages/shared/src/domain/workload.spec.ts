import { describe, expect, it } from 'vitest';
import { buildWorkload, type WorkloadItem } from './workload';

const item = (over: Partial<WorkloadItem> & { id: string }): WorkloadItem => ({
  points: null,
  estimateHours: null,
  dueDate: null,
  assigneeIds: [],
  ...over,
});
const TODAY = '2026-10-05';

describe('buildWorkload', () => {
  it('kişi başına adet, puan ve kalan süre toplar', () => {
    const rows = buildWorkload(
      [
        item({ id: '1', points: 5, assigneeIds: ['a'] }),
        item({ id: '2', estimateHours: 4, assigneeIds: ['a'] }),
        item({ id: '3', points: 3, assigneeIds: ['b'] }),
      ],
      new Map(),
      TODAY,
    );
    expect(rows.find((r) => r.userId === 'a')).toMatchObject({
      itemCount: 2,
      points: 5,
      remainingMinutes: 240,
    });
    expect(rows.find((r) => r.userId === 'b')).toMatchObject({ itemCount: 1, points: 3 });
  });

  it('harcanan süre tahminden düşer, eksiye inmez', () => {
    const rows = buildWorkload(
      [
        item({ id: '1', estimateHours: 4, assigneeIds: ['a'] }),
        item({ id: '2', estimateHours: 1, assigneeIds: ['a'] }),
      ],
      new Map([
        ['1', 60],
        ['2', 300],
      ]),
      TODAY,
    );
    expect(rows[0]!.remainingMinutes).toBe(180);
  });

  it('birden çok atanan: adet tam, puan ve süre eşit bölünür', () => {
    const rows = buildWorkload(
      [item({ id: '1', points: 5, estimateHours: 2, assigneeIds: ['a', 'b'] })],
      new Map(),
      TODAY,
    );
    for (const r of rows) {
      expect(r).toMatchObject({ itemCount: 1, points: 2.5, remainingMinutes: 60 });
    }
  });

  it('atanmamış işler ayrı satırda, sonda', () => {
    const rows = buildWorkload(
      [item({ id: '1', points: 8 }), item({ id: '2', points: 2, assigneeIds: ['a'] })],
      new Map(),
      TODAY,
    );
    expect(rows.map((r) => r.userId)).toEqual([null, 'a']);
    expect(rows[0]).toMatchObject({ itemCount: 1, points: 8 });
  });

  it('geciken ve 7 gün içinde bitecekleri ayırır', () => {
    const rows = buildWorkload(
      [
        item({ id: '1', dueDate: '2026-10-04', assigneeIds: ['a'] }),
        item({ id: '2', dueDate: '2026-10-05', assigneeIds: ['a'] }),
        item({ id: '3', dueDate: '2026-10-11', assigneeIds: ['a'] }),
        item({ id: '4', dueDate: '2026-10-12', assigneeIds: ['a'] }),
        item({ id: '5', assigneeIds: ['a'] }),
      ],
      new Map(),
      TODAY,
    );
    expect(rows[0]).toMatchObject({ itemCount: 5, overdue: 1, dueSoon: 2 });
  });

  it('boş girdi boş sonuç verir', () => {
    expect(buildWorkload([], new Map(), TODAY)).toEqual([]);
  });
});

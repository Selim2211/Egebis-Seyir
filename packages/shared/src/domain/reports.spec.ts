import { describe, expect, it } from 'vitest';
import { addDays, buildBurndown, buildVelocity, localDate } from './reports';

describe('localDate', () => {
  it('saat dilimine göre günü bulur', () => {
    const instant = new Date('2026-10-03T22:30:00Z');
    expect(localDate(instant, 'UTC')).toBe('2026-10-03');
    expect(localDate(instant, 'Europe/Istanbul')).toBe('2026-10-04');
  });
});

describe('addDays', () => {
  it('ay sınırını geçer', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });
});

describe('buildBurndown', () => {
  const base = { baseline: 0, startDate: '2026-10-05', endDate: '2026-10-09', scopeChanges: [] };

  it("snapshot yoksa kalan puan baseline'dır", () => {
    const b = buildBurndown({ ...base, lastDay: '2026-10-06', snapshots: [] });
    expect(b.baseline).toBe(0);
    expect(b.points.map((p) => p.remaining)).toEqual([0, 0, null, null, null]);
  });

  it('ideal çizgi baseline değerinden bitişte sıfıra iner', () => {
    const b = buildBurndown({
      ...base,
      baseline: 20,
      lastDay: '2026-10-09',
      snapshots: [{ date: '2026-10-05', remainingPoints: 20, totalPoints: 20 }],
    });
    expect(b.points.map((p) => p.ideal)).toEqual([20, 15, 10, 5, 0]);
  });

  it('eksik günler son snapshot ile doldurulur, gelecek günler null kalır', () => {
    const b = buildBurndown({
      ...base,
      baseline: 20,
      lastDay: '2026-10-07',
      snapshots: [
        { date: '2026-10-05', remainingPoints: 20, totalPoints: 20 },
        { date: '2026-10-06', remainingPoints: 17, totalPoints: 20 },
      ],
    });
    expect(b.points.map((p) => p.remaining)).toEqual([20, 17, 17, null, null]);
  });

  it('scope change gün bazında toplanır', () => {
    const b = buildBurndown({
      ...base,
      baseline: 10,
      lastDay: '2026-10-07',
      snapshots: [{ date: '2026-10-05', remainingPoints: 10, totalPoints: 10 }],
      scopeChanges: [
        { date: '2026-10-06', delta: 5 },
        { date: '2026-10-06', delta: -2 },
      ],
    });
    expect(b.points[1]?.scopeChange).toBe(3);
    expect(b.points[0]?.scopeChange).toBe(0);
  });

  it('süre aşılırsa eksen bugüne uzar, ideal sıfırda kalır', () => {
    const b = buildBurndown({
      ...base,
      baseline: 8,
      lastDay: '2026-10-11',
      snapshots: [{ date: '2026-10-05', remainingPoints: 8, totalPoints: 8 }],
    });
    expect(b.points.map((p) => p.date).at(-1)).toBe('2026-10-11');
    expect(b.points.at(-1)?.ideal).toBe(0);
    expect(b.points.at(-1)?.remaining).toBe(8);
  });

  it('tek günlük sprint tek nokta üretir', () => {
    const b = buildBurndown({
      baseline: 3,
      startDate: '2026-10-05',
      endDate: '2026-10-05',
      lastDay: '2026-10-05',
      snapshots: [{ date: '2026-10-05', remainingPoints: 3, totalPoints: 3 }],
      scopeChanges: [],
    });
    expect(b.points).toHaveLength(1);
    expect(b.points[0]?.ideal).toBe(0);
  });
});

describe('burn-up serileri', () => {
  it('toplam kapsam ve biten puan snapshot’tan gelir, gün atlanırsa taşınır', () => {
    const b = buildBurndown({
      startDate: '2026-10-05',
      endDate: '2026-10-07',
      lastDay: '2026-10-07',
      baseline: 10,
      scopeChanges: [],
      snapshots: [
        { date: '2026-10-05', remainingPoints: 10, totalPoints: 10 },
        { date: '2026-10-06', remainingPoints: 7, totalPoints: 12 },
      ],
    });
    expect(b.points.map((p) => [p.total, p.done])).toEqual([
      [10, 0],
      [12, 5],
      [12, 5],
    ]);
  });

  it('yaşanmamış günlerde null', () => {
    const b = buildBurndown({
      startDate: '2026-10-05',
      endDate: '2026-10-06',
      lastDay: '2026-10-05',
      baseline: 4,
      scopeChanges: [],
      snapshots: [],
    });
    expect(b.points.map((p) => [p.total, p.done])).toEqual([
      [4, 0],
      [null, null],
    ]);
  });
});

describe('buildVelocity', () => {
  const sprint = (n: number, completed: number | null) => ({
    id: String(n),
    name: `S${n}`,
    endDate: `2026-10-${String(10 + n).padStart(2, '0')}`,
    completedPoints: completed,
    committedPoints: null,
  });

  it('eskiden yeniye sıralar, son N tanesini alır', () => {
    const result = buildVelocity([sprint(3, 9), sprint(1, 5), sprint(2, 7)], 2);
    expect(result.map((s) => s.name)).toEqual(['S2', 'S3']);
  });

  it('donmuş puanı olmayanları atlar', () => {
    expect(buildVelocity([sprint(1, null), sprint(2, 4)], 10)).toHaveLength(1);
  });
});

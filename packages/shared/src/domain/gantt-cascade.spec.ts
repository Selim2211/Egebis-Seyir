import { describe, expect, it } from 'vitest';
import { cascadeReschedule } from './gantt-cascade';

const node = (id: string, startDate: string | null, dueDate: string | null) => ({
  id,
  startDate,
  dueDate,
});

describe('bağımlıları otomatik kaydırma (Faz 7.2)', () => {
  const nodes = [
    node('a', '2030-03-01', '2030-03-03'),
    node('b', '2030-03-04', '2030-03-06'),
    node('c', '2030-03-07', '2030-03-08'),
  ];
  const chain = [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
  ];

  it('öncülü ileri kaydırınca yalnızca ihlal edilen ardıllar, zincir boyunca kayar', () => {
    const result = cascadeReschedule(nodes, chain, 'a', 2);
    expect(result).toEqual([
      { id: 'a', startDate: '2030-03-03', dueDate: '2030-03-05' },
      { id: 'b', startDate: '2030-03-06', dueDate: '2030-03-08' },
      { id: 'c', startDate: '2030-03-09', dueDate: '2030-03-10' },
    ]);
  });

  it('boşluk varsa ardıl yalnızca gereken kadar kayar', () => {
    const roomy = [node('a', '2030-03-01', '2030-03-03'), node('b', '2030-03-10', '2030-03-12')];
    // a 8 gün ileri: bitiş 03-11 → b en erken 03-12'de başlar (2 gün kayma).
    expect(cascadeReschedule(roomy, [{ from: 'a', to: 'b' }], 'a', 8)).toEqual([
      { id: 'a', startDate: '2030-03-09', dueDate: '2030-03-11' },
      { id: 'b', startDate: '2030-03-12', dueDate: '2030-03-14' },
    ]);
    // a 2 gün ileri: ihlal yok, ardıl yerinde.
    expect(cascadeReschedule(roomy, [{ from: 'a', to: 'b' }], 'a', 2)).toEqual([
      { id: 'a', startDate: '2030-03-03', dueDate: '2030-03-05' },
    ]);
  });

  it('geri çekmede ardıllar yerinde kalır', () => {
    expect(cascadeReschedule(nodes, chain, 'a', -2)).toEqual([
      { id: 'a', startDate: '2030-02-27', dueDate: '2030-03-01' },
    ]);
  });

  it('tarihi eksik düğüm ve bilinmeyen kimlik; sıfır kayma', () => {
    expect(cascadeReschedule(nodes, chain, 'x', 3)).toEqual([]);
    expect(cascadeReschedule(nodes, chain, 'a', 0)).toEqual([]);
    const undated = [node('a', '2030-03-01', '2030-03-03'), node('b', null, null)];
    expect(cascadeReschedule(undated, [{ from: 'a', to: 'b' }], 'a', 5)).toEqual([
      { id: 'a', startDate: '2030-03-06', dueDate: '2030-03-08' },
    ]);
  });

  it('döngüde sonsuz döngüye girmez', () => {
    const cyc = [node('a', '2030-03-01', '2030-03-03'), node('b', '2030-03-02', '2030-03-04')];
    const result = cascadeReschedule(
      cyc,
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
      'a',
      1,
    );
    expect(result[0]).toEqual({ id: 'a', startDate: '2030-03-02', dueDate: '2030-03-04' });
  });
});

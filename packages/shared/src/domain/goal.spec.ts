import { describe, expect, it } from 'vitest';
import { goalPercent } from './goal';

describe('hedef ilerlemesi (Faz 7.9)', () => {
  it('görev bazlı: tamamlananın bağlı görevlere oranı; boşsa 0', () => {
    expect(goalPercent({ kind: 'TASKS', done: 3, total: 4 })).toBe(75);
    expect(goalPercent({ kind: 'TASKS', done: 1, total: 3 })).toBe(33);
    expect(goalPercent({ kind: 'TASKS', done: 0, total: 0 })).toBe(0);
  });
  it('sayısal: başlangıçtan hedefe kat edilen yol; 0–100 aralığına kırpılır', () => {
    expect(goalPercent({ kind: 'NUMBER', start: 0, current: 25, target: 100 })).toBe(25);
    expect(goalPercent({ kind: 'NUMBER', start: 10, current: 150, target: 100 })).toBe(100);
    expect(goalPercent({ kind: 'NUMBER', start: 0, current: -5, target: 100 })).toBe(0);
  });
  it('azaltma hedefi: 100 → 40, güncel 70 yüzde 50', () => {
    expect(goalPercent({ kind: 'NUMBER', start: 100, current: 70, target: 40 })).toBe(50);
  });
  it('başlangıç hedefe eşitse yalnızca ulaşınca tamam', () => {
    expect(goalPercent({ kind: 'NUMBER', start: 5, current: 5, target: 5 })).toBe(100);
    expect(goalPercent({ kind: 'NUMBER', start: 5, current: 4, target: 5 })).toBe(0);
  });
});

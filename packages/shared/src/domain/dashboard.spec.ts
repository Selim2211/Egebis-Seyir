import { describe, expect, it } from 'vitest';
import { WIDGET_IDS } from '../constants/dashboard';
import { toCsv } from './csv';
import { defaultDashboard, moveWidget, normalizeDashboard } from './dashboard';

describe('normalizeDashboard', () => {
  it('kayıt yoksa varsayılan düzen', () => {
    expect(normalizeDashboard(undefined)).toEqual(defaultDashboard());
    expect(normalizeDashboard('bozuk')).toEqual(defaultDashboard());
  });

  it('sırayı ve gizliliği korur, eksik widget’ları sona ekler', () => {
    const layout = normalizeDashboard([
      { id: 'velocity', size: 'L', visible: true },
      { id: 'cfd', size: 'M', visible: false },
    ]);
    expect(layout.map((w) => w.id).slice(0, 2)).toEqual(['velocity', 'cfd']);
    expect(layout[0]).toMatchObject({ size: 'L', visible: true });
    expect(layout[1]).toMatchObject({ visible: false });
    expect(layout.map((w) => w.id).sort()).toEqual([...WIDGET_IDS].sort());
  });

  it('bilinmeyen, tekrarlı ve geçersiz boyutlu kayıtları düzeltir', () => {
    const layout = normalizeDashboard([
      { id: 'yok', size: 'M' },
      { id: 'sprint', size: 'XL' },
      { id: 'sprint', size: 'M' },
    ]);
    expect(layout.filter((w) => w.id === 'sprint')).toHaveLength(1);
    expect(layout[0]).toEqual({ id: 'sprint', size: 'L', visible: true });
    expect(layout).toHaveLength(WIDGET_IDS.length);
  });
});

describe('moveWidget', () => {
  const base = normalizeDashboard([
    { id: 'sprint', size: 'L', visible: true },
    { id: 'velocity', size: 'M', visible: false },
    { id: 'cfd', size: 'L', visible: true },
  ]);

  it('görünürler arasında yer değiştirir, gizliler yerinde kalır', () => {
    const moved = moveWidget(base, 'cfd', -1);
    expect(moved.map((w) => w.id).slice(0, 3)).toEqual(['cfd', 'velocity', 'sprint']);
  });

  it('uçta etkisiz', () => {
    expect(moveWidget(base, 'sprint', -1)).toEqual(base);
    expect(moveWidget(base, 'velocity', 1)).toEqual(base);
  });
});

describe('toCsv', () => {
  it('BOM, CRLF ve tırnaklama', () => {
    const csv = toCsv([
      ['Ad', 'Not'],
      ['Ali, Veli', 'He said "hi"'],
      ['Satır\nsonu', 5],
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Ad,Not\r\n');
    expect(csv).toContain('"Ali, Veli","He said ""hi"""');
    expect(csv).toContain('"Satır\nsonu",5');
  });

  it('formül enjeksiyonunu etkisizleştirir, sayılara dokunmaz', () => {
    const csv = toCsv([['=1+1', '-5', -5, null]]);
    expect(csv).toContain("'=1+1,'-5,-5,");
  });
});

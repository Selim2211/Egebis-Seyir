import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';
import {
  cellFor,
  parseCsv,
  parseImportDate,
  parseImportNumber,
  parsePriority,
  parseType,
  splitImportList,
  suggestMapping,
  toImportTable,
} from './csv-import';

describe('parseCsv', () => {
  it('tırnaklı alan, çift tırnak ve tırnak içi satır sonunu okur', () => {
    const text = 'a,b\r\n"x, y","say ""merhaba"""\r\n"iki\nsatır",z\r\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b'],
      ['x, y', 'say "merhaba"'],
      ['iki\nsatır', 'z'],
    ]);
  });
  it('BOM, noktalı virgül ayırıcı ve boş satırları işler', () => {
    const text = '﻿Başlık;Durum\n\nGörev 1;Açık\n';
    expect(parseCsv(text)).toEqual([
      ['Başlık', 'Durum'],
      ['Görev 1', 'Açık'],
    ]);
  });
  it('sondaki satır sonu olmadan da çalışır; boş hücre korunur', () => {
    expect(parseCsv('a,b,c\n1,,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });
  it('dışa aktarmayla gidiş-dönüş: formül koruması geri alınır', () => {
    const rows = [
      ['Başlık', 'Not'],
      ['=1+1', 'a,b'],
      ['@kullanıcı', 'x "y"'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe('suggestMapping', () => {
  it('TR ve EN başlıkları tanır; özel alanı ada göre eşler', () => {
    const mapping = suggestMapping(
      ['Başlık', 'Durum', 'Öncelik', 'Bitiş Tarihi', 'Müşteri', 'ID'],
      [{ id: 'f1', name: 'Müşteri' }],
    );
    expect(mapping).toMatchObject({
      title: 'Başlık',
      status: 'Durum',
      priority: 'Öncelik',
      dueDate: 'Bitiş Tarihi',
      externalId: 'ID',
      'cf:f1': 'Müşteri',
      assignees: null,
    });
  });
  it('aynı başlık iki hedefe atanmaz', () => {
    const mapping = suggestMapping(['Title']);
    expect(mapping.title).toBe('Title');
    expect(Object.values(mapping).filter((v) => v === 'Title')).toHaveLength(1);
  });
});

describe('değer ayrıştırıcıları', () => {
  it('tip ve öncelik TR/EN adlarını tanır', () => {
    expect(parseType('Hikaye')).toBe('STORY');
    expect(parseType('alt görev')).toBe('SUBTASK');
    expect(parseType('Hata')).toBe('BUG');
    expect(parseType('bilinmeyen')).toBeNull();
    expect(parsePriority('Yüksek')).toBe('HIGH');
    expect(parsePriority('ACİL')).toBe('URGENT');
    expect(parsePriority('düşük')).toBe('LOW');
    expect(parsePriority('?')).toBeNull();
  });
  it('tarih: ISO ve gün-önce biçimleri, gerçek gün denetimi', () => {
    expect(parseImportDate('2026-03-05')).toBe('2026-03-05');
    expect(parseImportDate('5.3.2026')).toBe('2026-03-05');
    expect(parseImportDate('05/03/2026')).toBe('2026-03-05');
    expect(parseImportDate('31.02.2026')).toBeNull();
    expect(parseImportDate('yarın')).toBeNull();
  });
  it('sayı: virgül ondalık, negatif ve metin reddedilir', () => {
    expect(parseImportNumber('3,5')).toBe(3.5);
    expect(parseImportNumber('8')).toBe(8);
    expect(parseImportNumber('-1')).toBeNull();
    expect(parseImportNumber('abc')).toBeNull();
    expect(parseImportNumber('')).toBeNull();
  });
  it('liste ayırır, tekrarları atar', () => {
    expect(splitImportList('a; b ,a|c')).toEqual(['a', 'b', 'c']);
    expect(splitImportList('')).toEqual([]);
  });
});

describe('toImportTable / cellFor', () => {
  it('kısa satırları tamamlar ve eşlenen hücreyi okur', () => {
    const table = toImportTable([['Başlık', 'Durum'], ['A']]);
    expect(table.rows).toEqual([['A', '']]);
    const mapping = { title: 'Başlık', status: 'Durum', priority: null };
    expect(cellFor(table, mapping, table.rows[0]!, 'title')).toBe('A');
    expect(cellFor(table, mapping, table.rows[0]!, 'priority')).toBe('');
    expect(cellFor(table, mapping, table.rows[0]!, 'dueDate')).toBe('');
  });
});

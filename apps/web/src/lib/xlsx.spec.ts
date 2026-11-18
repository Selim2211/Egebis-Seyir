import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildXlsx, columnName } from './xlsx';

describe('buildXlsx', () => {
  it('sütun adları', () => {
    expect([0, 1, 25, 26, 27, 701, 702].map(columnName)).toEqual([
      'A',
      'B',
      'Z',
      'AA',
      'AB',
      'ZZ',
      'AAA',
    ]);
  });

  it('geçerli bir paket üretir ve içerik doğru yazılır', () => {
    const files = unzipSync(
      buildXlsx(
        [
          ['Zaman', 'Kişi', 'Sayı'],
          ['2026-11-13T10:00:00Z', 'Ayşe <Yılmaz> & "Ortak"', 42],
          ['x', null, undefined],
        ],
        'Denetim',
      ),
    );
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ]);
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']!);
    expect(sheet).toContain('Ayşe &lt;Yılmaz&gt; &amp; &quot;Ortak&quot;');
    expect(sheet).toContain('<c r="C2"><v>42</v></c>');
    expect(sheet).toContain('<c r="A1" s="1" t="inlineStr">'); // kalın başlık
    expect(strFromU8(files['xl/workbook.xml']!)).toContain('name="Denetim"');
  });

  it('XML için geçersiz denetim karakterlerini atar', () => {
    const files = unzipSync(buildXlsx([['a\u0001b']]));
    expect(strFromU8(files['xl/worksheets/sheet1.xml']!)).toContain('>ab<');
  });
});

import { describe, expect, it } from 'vitest';
import { diffLines, docToMarkdown, richTextToMarkdownLines } from './doc-export';
import type { RichTextNode } from './rich-text';

const p = (text: string, marks?: RichTextNode['marks']): RichTextNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text, ...(marks && { marks }) }],
});
const doc = (...content: RichTextNode[]): RichTextNode => ({ type: 'doc', content });

describe('Markdown dışa aktarma (Faz 7.6)', () => {
  it('başlık, biçimlendirme ve bağlantı', () => {
    const d = doc(
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Kurulum' }] },
      p('kalın', [{ type: 'bold' }]),
      p('site', [{ type: 'link', attrs: { href: 'https://example.com' } }]),
    );
    expect(richTextToMarkdownLines(d)).toEqual([
      '## Kurulum',
      '**kalın**',
      '[site](https://example.com)',
    ]);
    expect(docToMarkdown('Rehber', d)).toBe(
      '# Rehber\n\n## Kurulum\n\n**kalın**\n\n[site](https://example.com)\n',
    );
  });

  it('listeler, görev listesi, kod bloğu ve tablo', () => {
    const d = doc(
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [p('bir')] },
          { type: 'listItem', content: [p('iki')] },
        ],
      },
      {
        type: 'taskList',
        content: [
          { type: 'taskItem', attrs: { checked: true }, content: [p('bitti')] },
          { type: 'taskItem', attrs: { checked: false }, content: [p('açık')] },
        ],
      },
      { type: 'codeBlock', content: [{ type: 'text', text: 'npm ci' }] },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', content: [p('Ad')] },
              { type: 'tableHeader', content: [p('Not')] },
            ],
          },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [p('A')] },
              { type: 'tableCell', content: [p('x|y')] },
            ],
          },
        ],
      },
    );
    expect(richTextToMarkdownLines(d)).toEqual([
      '- bir',
      '- iki',
      '- [x] bitti',
      '- [ ] açık',
      '```',
      'npm ci',
      '```',
      '| Ad | Not |',
      '| --- | --- |',
      '| A | x\\|y |',
    ]);
  });

  it('boş belge boş çıktı verir', () => {
    expect(richTextToMarkdownLines(null)).toEqual([]);
  });
});

describe('satır farkı (Faz 7.6)', () => {
  it('ekleme, silme ve değişmeyen satırlar', () => {
    expect(diffLines(['a', 'b', 'c'], ['a', 'x', 'c', 'd'])).toEqual([
      { type: 'same', text: 'a' },
      { type: 'del', text: 'b' },
      { type: 'add', text: 'x' },
      { type: 'same', text: 'c' },
      { type: 'add', text: 'd' },
    ]);
  });
  it('aynı içerik tamamen aynı; boş taraflar', () => {
    expect(diffLines(['a'], ['a'])).toEqual([{ type: 'same', text: 'a' }]);
    expect(diffLines([], ['a'])).toEqual([{ type: 'add', text: 'a' }]);
    expect(diffLines(['a'], [])).toEqual([{ type: 'del', text: 'a' }]);
  });
});

describe('docToMarkdown images (Faz 8.6)', () => {
  it('writes an image as Markdown with its alt text', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'image', attrs: { src: '/api/x?preview=1', alt: 'Şema' } }],
    };
    expect(docToMarkdown('Sayfa', doc)).toContain('![Şema](/api/x?preview=1)');
  });
});

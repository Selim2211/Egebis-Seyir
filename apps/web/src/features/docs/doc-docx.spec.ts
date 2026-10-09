import type { RichTextNode } from '@scrum/shared';
import { Packer } from 'docx';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { docToDocx, type DocxImage } from './doc-docx';

const text = (value: string, marks?: RichTextNode['marks']): RichTextNode => ({
  type: 'text',
  text: value,
  marks,
});
const p = (...content: RichTextNode[]): RichTextNode => ({ type: 'paragraph', content });

// 1×1 saydam PNG.
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);
const image: DocxImage = { data: PNG, type: 'png', width: 1200, height: 600 };

async function build(
  content: RichTextNode,
  loader: () => Promise<DocxImage | null> = () => Promise.resolve(image),
) {
  const doc = await docToDocx('Mimari', content, loader);
  const zip = unzipSync(new Uint8Array(await Packer.toBuffer(doc)));
  return { zip, xml: strFromU8(zip['word/document.xml']!) };
}

describe('docToDocx', () => {
  it('writes the title, headings, formatted text and links', async () => {
    const { xml } = await build({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [text('Bölüm')] },
        p(
          text('kalın', [{ type: 'bold' }]),
          text(' ve '),
          text('bağlantı', [{ type: 'link', attrs: { href: 'https://example.com' } }]),
        ),
      ],
    });
    expect(xml).toContain('Mimari');
    expect(xml).toContain('Bölüm');
    expect(xml).toContain('Heading2');
    expect(xml).toContain('<w:b/>');
    expect(xml).toContain('w:hyperlink');
  });

  it('writes lists, task items and tables', async () => {
    const { xml } = await build({
      type: 'doc',
      content: [
        { type: 'bulletList', content: [{ type: 'listItem', content: [p(text('madde'))] }] },
        { type: 'orderedList', content: [{ type: 'listItem', content: [p(text('birinci'))] }] },
        {
          type: 'taskList',
          content: [{ type: 'taskItem', attrs: { checked: true }, content: [p(text('bitti'))] }],
        },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', content: [p(text('Başlık'))] },
                { type: 'tableCell', content: [p(text('Hücre'))] },
              ],
            },
          ],
        },
      ],
    });
    expect(xml).toContain('w:numPr');
    expect(xml).toContain('☑ ');
    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('Hücre');
  });

  it('embeds images (scaled to the page) or leaves a placeholder when they cannot load', async () => {
    const node: RichTextNode = {
      type: 'doc',
      content: [{ type: 'image', attrs: { src: '/x', alt: 'Şema' } }],
    };
    const withImage = await build(node);
    expect(Object.keys(withImage.zip).some((name) => name.startsWith('word/media/'))).toBe(true);
    const cx = /<wp:extent cx="(\d+)"/.exec(withImage.xml)![1]!;
    expect(Number(cx) / 9525).toBeLessThanOrEqual(560);

    const without = await build(node, () => Promise.resolve(null));
    expect(Object.keys(without.zip).some((name) => name.startsWith('word/media/'))).toBe(false);
    expect(without.xml).toContain('[Şema]');
  });

  it('handles an empty document', async () => {
    const { xml } = await build({ type: 'doc', content: [] });
    expect(xml).toContain('Mimari');
  });
});

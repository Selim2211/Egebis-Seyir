import { describe, expect, it } from 'vitest';
import {
  extractMentionIds,
  stripMentions,
  isRichTextEmpty,
  isValidRichText,
  RICH_TEXT_MAX_BYTES,
  richTextToPlain,
  type RichTextNode,
} from './rich-text';

const p = (text: string, marks?: RichTextNode['marks']): RichTextNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text, ...(marks && { marks }) }],
});
const doc = (...content: RichTextNode[]) => ({ type: 'doc', content });

describe('zengin metin doğrulaması (ADR-048)', () => {
  it('izinli yapıyı kabul eder', () => {
    expect(
      isValidRichText(
        doc(
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Başlık' }] },
          p('kalın', [{ type: 'bold' }]),
          p('bağ', [{ type: 'link', attrs: { href: 'https://example.com' } }]),
          {
            type: 'bulletList',
            content: [{ type: 'listItem', content: [p('madde')] }],
          },
          { type: 'codeBlock', content: [{ type: 'text', text: 'x = 1' }] },
        ),
      ),
    ).toBe(true);
  });

  it('bilinmeyen düğüm ve işaretleri reddeder', () => {
    expect(isValidRichText(doc({ type: 'script' }))).toBe(false);
    expect(isValidRichText(doc({ type: 'image', attrs: { src: 'x' } }))).toBe(false);
    expect(isValidRichText(doc(p('x', [{ type: 'highlight' }])))).toBe(false);
  });

  it('tehlikeli bağlantıları reddeder', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.com']) {
      expect(isValidRichText(doc(p('x', [{ type: 'link', attrs: { href } }])))).toBe(false);
    }
    expect(isValidRichText(doc(p('x', [{ type: 'link', attrs: { href: 'mailto:a@b.co' } }])))).toBe(
      true,
    );
    expect(isValidRichText(doc(p('x', [{ type: 'link' }])))).toBe(false);
  });

  it('kök doc olmalı; başlık seviyesi 1-3', () => {
    expect(isValidRichText({ type: 'paragraph' })).toBe(false);
    expect(isValidRichText(null)).toBe(false);
    expect(isValidRichText('<p>x</p>')).toBe(false);
    expect(isValidRichText(doc({ type: 'heading', attrs: { level: 5 } }))).toBe(false);
  });

  it('metin yalnızca text düğümünde olabilir', () => {
    expect(isValidRichText(doc({ type: 'paragraph', text: 'x' }))).toBe(false);
  });

  it('çok derin veya çok büyük belgeyi reddeder', () => {
    let deep: RichTextNode = p('x');
    for (let i = 0; i < 30; i++) deep = { type: 'blockquote', content: [deep] };
    expect(isValidRichText(doc(deep))).toBe(false);
    expect(isValidRichText(doc(p('a'.repeat(RICH_TEXT_MAX_BYTES))))).toBe(false);
  });
});

describe('düz metin çıkarımı', () => {
  it('bloklar arası satır sonu ekler', () => {
    const text = richTextToPlain(
      doc(p('Merhaba'), {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [p('bir')] },
          { type: 'listItem', content: [p('iki')] },
        ],
      }),
    );
    expect(text).toBe('Merhaba\nbir\n\niki');
  });

  it('boş belge boş sayılır', () => {
    expect(isRichTextEmpty(doc({ type: 'paragraph' }))).toBe(true);
    expect(isRichTextEmpty(doc(p('  ')))).toBe(true);
    expect(isRichTextEmpty(doc(p('x')))).toBe(false);
  });
});

describe('mention (ADR-055)', () => {
  const mention = (id: string, label = 'Ali'): RichTextNode => ({
    type: 'mention',
    attrs: { id, label },
  });
  const withMentions = doc({
    type: 'paragraph',
    content: [
      { type: 'text', text: 'Selam ' },
      mention('u1'),
      { type: 'text', text: ' ve ' },
      mention('u2', 'Veli'),
      mention('u1'),
    ],
  });

  it('geçerli mention kabul edilir; kimliksiz veya içerikli reddedilir', () => {
    expect(isValidRichText(withMentions)).toBe(true);
    expect(
      isValidRichText(doc({ type: 'paragraph', content: [{ type: 'mention', attrs: {} }] })),
    ).toBe(false);
    expect(
      isValidRichText(
        doc({
          type: 'paragraph',
          content: [
            { type: 'mention', attrs: { id: 'u1' }, content: [{ type: 'text', text: 'x' }] },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('kimlikleri tekrarsız çıkarır', () => {
    expect(extractMentionIds(withMentions)).toEqual(['u1', 'u2']);
  });

  it('düz metinde @ad görünür', () => {
    expect(richTextToPlain(withMentions)).toBe('Selam @Ali ve @Veli@Ali');
  });

  it('yetkisiz mention düz metne iner, yetkili kalır', () => {
    const stripped = stripMentions(withMentions, new Set(['u1']));
    expect(extractMentionIds(stripped)).toEqual(['u1']);
    expect(richTextToPlain(stripped)).toBe('Selam @Ali ve @Veli@Ali');
  });
});

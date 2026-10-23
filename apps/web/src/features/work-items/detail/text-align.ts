import { TEXT_ALIGNS, type TextAlign } from '@scrum/shared';
import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textAlign: {
      /** Seçili paragraf ve başlıkları hizalar (null = sola, varsayılan). */
      setTextAlign: (align: TextAlign | null) => ReturnType;
    };
  }
}

const isAlign = (value: unknown): value is TextAlign =>
  (TEXT_ALIGNS as readonly unknown[]).includes(value);

/**
 * Metin hizalama (Sola / Ortala / Sağa). Paragraf ve başlıklara yazılır; tablo hücrelerinin içindeki metin de
 * paragraf olduğundan hücrelerde de çalışır. Yalnızca bilinen üç değer okunur ve yazılır; sunucu da aynı
 * kuralla doğrular (rich-text.ts).
 */
export const TextAlignment = Extension.create({
  name: 'textAlign',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          textAlign: {
            default: null as TextAlign | null,
            parseHTML: (el: HTMLElement) =>
              isAlign(el.style.textAlign) ? el.style.textAlign : null,
            renderHTML: (attrs: { textAlign?: TextAlign | null }) =>
              attrs.textAlign && attrs.textAlign !== 'left'
                ? { style: `text-align: ${attrs.textAlign}` }
                : {},
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setTextAlign:
        (align) =>
        ({ commands }) => {
          const value = align === 'left' ? null : align;
          return ['paragraph', 'heading']
            .map((type) => commands.updateAttributes(type, { textAlign: value }))
            .some(Boolean);
        },
    };
  },
});

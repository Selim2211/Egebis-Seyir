import { CELL_COLOR_PATTERN } from '@scrum/shared';
import { TableCell, TableHeader } from '@tiptap/extension-table';

/**
 * Hücre arka plan rengi (Word'deki "Gölgelendirme"). Yalnızca `#rrggbb` değerleri yazılır ve okunur;
 * sunucu da aynı kuralla doğrular (rich-text.ts), böylece stil üzerinden enjeksiyon olmaz.
 */
const backgroundColor = {
  backgroundColor: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => {
      const value = el.getAttribute('data-bg');
      return value && CELL_COLOR_PATTERN.test(value) ? value : null;
    },
    renderHTML: (attrs: { backgroundColor?: string | null }) =>
      attrs.backgroundColor && CELL_COLOR_PATTERN.test(attrs.backgroundColor)
        ? { 'data-bg': attrs.backgroundColor, style: `background-color: ${attrs.backgroundColor}` }
        : {},
  },
};

export const ColoredTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...backgroundColor };
  },
});

export const ColoredTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...backgroundColor };
  },
});

/** Hücre rengi paleti (açık tonlar: metin okunur kalır). `null` = renksiz. */
export const CELL_COLORS = [
  null,
  '#f3f4f6',
  '#fee2e2',
  '#ffedd5',
  '#fef9c3',
  '#dcfce7',
  '#dbeafe',
  '#ede9fe',
  '#fce7f3',
] as const;

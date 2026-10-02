/**
 * Zengin metin (ADR-048): Tiptap belge JSON'u. Sunucu ve web aynı doğrulamayı kullanır;
 * izinli düğüm ve işaretler dışındaki her şey reddedilir (XSS yüzeyi küçük tutulur).
 */
export interface RichTextMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface RichTextNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
  marks?: RichTextMark[];
  text?: string;
}

export type RichTextDoc = RichTextNode & { type: 'doc' };

export const RICH_TEXT_NODES = [
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'codeBlock',
  'blockquote',
  'horizontalRule',
  'hardBreak',
  /** Yalnızca yorumlarda üretilir; `attrs.id` kullanıcı kimliğidir (ADR-055). */
  'mention',
] as const;

export const RICH_TEXT_MARKS = ['bold', 'italic', 'strike', 'underline', 'code', 'link'] as const;

/** Belge boyutu üst sınırı (JSON bayt). */
export const RICH_TEXT_MAX_BYTES = 200_000;
const MAX_DEPTH = 20;
/** Mention etiketi; metin değilse boş. */
const labelOf = (node: RichTextNode): string =>
  typeof node.attrs?.label === 'string' ? node.attrs.label : '';
const MAX_PLAIN_TEXT = 50_000;
const SAFE_LINK = /^(https?:\/\/|mailto:)/i;
const BLOCK_NODES = new Set([
  'paragraph',
  'heading',
  'listItem',
  'codeBlock',
  'blockquote',
  'horizontalRule',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function validNode(node: unknown, depth: number): node is RichTextNode {
  if (!isRecord(node) || depth > MAX_DEPTH) return false;
  const { type, content, marks, text, attrs } = node;
  if (typeof type !== 'string' || !(RICH_TEXT_NODES as readonly string[]).includes(type)) {
    return false;
  }
  if (text !== undefined && (typeof text !== 'string' || type !== 'text')) return false;
  if (type === 'text' && typeof text !== 'string') return false;
  if (attrs !== undefined && !isRecord(attrs)) return false;
  if (type === 'mention') {
    const id = attrs?.id;
    if (typeof id !== 'string' || id.length === 0 || id.length > 64) return false;
    if (attrs?.label !== undefined && typeof attrs.label !== 'string') return false;
    if (content !== undefined) return false;
  }
  if (type === 'heading') {
    const level = attrs?.level;
    if (typeof level !== 'number' || ![1, 2, 3].includes(level)) return false;
  }
  if (marks !== undefined) {
    if (!Array.isArray(marks)) return false;
    for (const mark of marks) {
      if (!isRecord(mark) || !(RICH_TEXT_MARKS as readonly unknown[]).includes(mark.type)) {
        return false;
      }
      if (mark.type === 'link') {
        const href = isRecord(mark.attrs) ? mark.attrs.href : undefined;
        if (typeof href !== 'string' || !SAFE_LINK.test(href.trim())) return false;
      }
    }
  }
  if (content !== undefined) {
    if (!Array.isArray(content)) return false;
    return content.every((child) => validNode(child, depth + 1));
  }
  return true;
}

/** Belgenin izinli yapıda ve boyutta olup olmadığını söyler. */
export function isValidRichText(doc: unknown): doc is RichTextDoc {
  if (!isRecord(doc) || doc.type !== 'doc') return false;
  if (JSON.stringify(doc).length > RICH_TEXT_MAX_BYTES) return false;
  return validNode(doc, 0);
}

/** Aramada kullanılacak düz metin: bloklar arasında satır sonu, en çok 50.000 karakter. */
export function richTextToPlain(doc: RichTextNode): string {
  const parts: string[] = [];
  const walk = (node: RichTextNode) => {
    if (node.type === 'text') parts.push(node.text ?? '');
    if (node.type === 'mention') parts.push(`@${labelOf(node)}`);
    if (node.type === 'hardBreak') parts.push('\n');
    for (const child of node.content ?? []) walk(child);
    if (BLOCK_NODES.has(node.type)) parts.push('\n');
  };
  walk(doc);
  return parts
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_PLAIN_TEXT);
}

/** Boş belge (yalnızca boş paragraf/boşluk) mu? Boşsa saklamak yerine `null` yazılır. */
export const isRichTextEmpty = (doc: RichTextNode): boolean => richTextToPlain(doc) === '';

/** Belgedeki mention'ların kullanıcı kimlikleri (tekrarsız, sıralı). */
export function extractMentionIds(doc: RichTextNode): string[] {
  const ids = new Set<string>();
  const walk = (node: RichTextNode) => {
    if (node.type === 'mention' && typeof node.attrs?.id === 'string') ids.add(node.attrs.id);
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return [...ids];
}

/** Geçersiz (yetkisiz/bilinmeyen) mention'ları düz metne indirir; kalanlar korunur. */
export function stripMentions(doc: RichTextNode, allowed: ReadonlySet<string>): RichTextNode {
  const visit = (node: RichTextNode): RichTextNode => {
    if (node.type === 'mention' && !allowed.has(String(node.attrs?.id))) {
      return { type: 'text', text: `@${labelOf(node)}` };
    }
    return node.content ? { ...node, content: node.content.map(visit) } : node;
  };
  return visit(doc);
}

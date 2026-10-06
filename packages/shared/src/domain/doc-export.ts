import type { RichTextNode } from './rich-text';

/**
 * Doküman dışa aktarma ve sürüm farkı (Faz 7.6). Tiptap belgesi Markdown'a çevrilir; sürüm farkı bu
 * Markdown'ın satırları üzerinden hesaplanır. Saf ve deterministiktir.
 */

const inline = (node: RichTextNode): string => {
  if (node.type === 'hardBreak') return '  \n';
  if (node.type === 'mention') {
    const label = typeof node.attrs?.label === 'string' ? node.attrs.label : '';
    return `@${label}`;
  }
  if (node.type !== 'text') return (node.content ?? []).map(inline).join('');
  let text = node.text ?? '';
  for (const mark of node.marks ?? []) {
    if (mark.type === 'code') text = `\`${text}\``;
    else if (mark.type === 'bold') text = `**${text}**`;
    else if (mark.type === 'italic') text = `*${text}*`;
    else if (mark.type === 'strike') text = `~~${text}~~`;
    else if (mark.type === 'link' && typeof mark.attrs?.href === 'string') {
      text = `[${text}](${mark.attrs.href})`;
    }
  }
  return text;
};

const inlineChildren = (node: RichTextNode) => (node.content ?? []).map(inline).join('');

function blocks(nodes: RichTextNode[], indent = ''): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case 'paragraph':
        out.push(indent + inlineChildren(node));
        break;
      case 'heading': {
        const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 3);
        out.push(`${'#'.repeat(level)} ${inlineChildren(node)}`);
        break;
      }
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        (node.content ?? []).forEach((item, i) => {
          const marker =
            node.type === 'orderedList'
              ? `${i + 1}. `
              : node.type === 'taskList'
                ? `- [${item.attrs?.checked === true ? 'x' : ' '}] `
                : '- ';
          const [first = '', ...rest] = blocks(item.content ?? [], '');
          out.push(`${indent}${marker}${first}`);
          for (const line of rest) out.push(`${indent}  ${line}`);
        });
        break;
      case 'blockquote':
        for (const line of blocks(node.content ?? [])) out.push(`> ${line}`);
        break;
      case 'codeBlock':
        out.push('```', ...inlineChildren(node).split('\n'), '```');
        break;
      case 'horizontalRule':
        out.push('---');
        break;
      case 'table': {
        const rows = (node.content ?? []).map((row) =>
          (row.content ?? []).map((cell) =>
            blocks(cell.content ?? [])
              .join(' ')
              .replace(/\|/g, '\\|'),
          ),
        );
        rows.forEach((cells, i) => {
          out.push(`| ${cells.join(' | ')} |`);
          if (i === 0) out.push(`| ${cells.map(() => '---').join(' | ')} |`);
        });
        break;
      }
      default:
        if (node.content) out.push(...blocks(node.content, indent));
    }
  }
  return out;
}

/** Belgeyi Markdown satırlarına çevirir (bloklar arasında boş satır yok; fark için satır tabanlıdır). */
export function richTextToMarkdownLines(doc: RichTextNode | null): string[] {
  return doc ? blocks(doc.content ?? []) : [];
}

/** Başlık + gövde ile tek parça Markdown metni (bloklar arası boş satır). */
export function docToMarkdown(title: string, doc: RichTextNode | null): string {
  return `# ${title}\n\n${richTextToMarkdownLines(doc).join('\n\n')}\n`;
}

export type DiffOp = { type: 'same' | 'add' | 'del'; text: string };

/** En uzun ortak altdizi tabanlı satır farkı (eski → yeni). */
export function diffLines(before: readonly string[], after: readonly string[]): DiffOp[] {
  const n = before.length;
  const m = after.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] =
        before[i] === after[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      ops.push({ type: 'same', text: before[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ops.push({ type: 'del', text: before[i++]! });
    } else {
      ops.push({ type: 'add', text: after[j++]! });
    }
  }
  while (i < n) ops.push({ type: 'del', text: before[i++]! });
  while (j < m) ops.push({ type: 'add', text: after[j++]! });
  return ops;
}

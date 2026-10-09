import type { RichTextMark, RichTextNode } from '@scrum/shared';
import {
  AlignmentType,
  BorderStyle,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from 'docx';

/** Word'e gömülecek bir görsel. */
export interface DocxImage {
  data: Uint8Array;
  type: 'png' | 'jpg' | 'gif';
  width: number;
  height: number;
}
export type ImageLoader = (src: string) => Promise<DocxImage | null>;

const MAX_IMAGE_WIDTH = 560; // A4 yazı alanı ≈ 6 inç
const SAFE_LINK = /^(https?:\/\/|mailto:)/i;
const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3] as const;
const BULLET = 'bullets';
const INDENT = 360;
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

interface Context {
  loadImage: ImageLoader;
  /** Her sıralı liste kendi numarasından başlasın diye ayrı numaralandırma referansı. */
  orderedRefs: string[];
}

function runsOf(node: RichTextNode): ParagraphChild[] {
  if (node.type === 'hardBreak') return [new TextRun({ break: 1 })];
  if (node.type === 'mention') return [new TextRun({ text: `@${str(node.attrs?.label)}` })];
  if (node.type !== 'text') return (node.content ?? []).flatMap(runsOf);
  const marks: RichTextMark[] = node.marks ?? [];
  const has = (type: string) => marks.some((m) => m.type === type);
  const run = new TextRun({
    text: node.text ?? '',
    bold: has('bold') || undefined,
    italics: has('italic') || undefined,
    strike: has('strike') || undefined,
    underline: has('underline') ? {} : undefined,
    font: has('code') ? 'Consolas' : undefined,
    shading: has('code') ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F1F1F4' } : undefined,
  });
  const link = marks.find((m) => m.type === 'link');
  const href = str(link?.attrs?.href);
  if (link && SAFE_LINK.test(href)) {
    return [
      new ExternalHyperlink({
        link: href,
        children: [
          new TextRun({
            text: node.text ?? '',
            style: 'Hyperlink',
            color: '2563EB',
            underline: {},
            bold: has('bold') || undefined,
            italics: has('italic') || undefined,
          }),
        ],
      }),
    ];
  }
  return [run];
}

async function blocksOf(
  nodes: readonly RichTextNode[],
  ctx: Context,
  level = 0,
): Promise<Array<Paragraph | Table>> {
  const out: Array<Paragraph | Table> = [];
  for (const node of nodes) {
    switch (node.type) {
      case 'paragraph':
        out.push(
          new Paragraph({
            children: runsOf(node),
            indent: level > 0 ? { left: level * INDENT } : undefined,
            spacing: { after: 120 },
          }),
        );
        break;
      case 'heading': {
        const index = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 3) - 1;
        out.push(new Paragraph({ heading: HEADINGS[index], children: runsOf(node) }));
        break;
      }
      case 'bulletList':
      case 'orderedList':
      case 'taskList': {
        const ref =
          node.type === 'orderedList' ? `ordered-${ctx.orderedRefs.push('') - 1}` : BULLET;
        if (node.type === 'orderedList') ctx.orderedRefs[ctx.orderedRefs.length - 1] = ref;
        for (const item of node.content ?? []) {
          const [first, ...rest] = item.content ?? [];
          const lead = first?.type === 'paragraph' ? first : undefined;
          const checked = item.attrs?.checked === true;
          out.push(
            new Paragraph({
              children: [
                ...(node.type === 'taskList' ? [new TextRun({ text: checked ? '☑ ' : '☐ ' })] : []),
                ...(lead ? runsOf(lead) : []),
              ],
              ...(node.type === 'taskList'
                ? { indent: { left: (level + 1) * INDENT } }
                : { numbering: { reference: ref, level: Math.min(level, 2) } }),
              spacing: { after: 60 },
            }),
          );
          const nested = lead ? rest : (item.content ?? []);
          out.push(...(await blocksOf(nested, ctx, level + 1)));
        }
        break;
      }
      case 'blockquote':
        for (const child of node.content ?? []) {
          if (child.type === 'paragraph') {
            out.push(
              new Paragraph({
                children: runsOf(child),
                indent: { left: (level + 1) * INDENT },
                border: {
                  left: { style: BorderStyle.SINGLE, size: 12, color: 'C4C4CC', space: 8 },
                },
                spacing: { after: 120 },
              }),
            );
          } else {
            out.push(...(await blocksOf([child], ctx, level + 1)));
          }
        }
        break;
      case 'codeBlock':
        for (const line of (node.content ?? [])
          .map((c) => c.text ?? '')
          .join('')
          .split('\n')) {
          out.push(
            new Paragraph({
              children: [new TextRun({ text: line, font: 'Consolas', size: 20 })],
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F1F1F4' },
              spacing: { after: 0 },
            }),
          );
        }
        out.push(new Paragraph({ spacing: { after: 120 } }));
        break;
      case 'horizontalRule':
        out.push(
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'C4C4CC', space: 1 } },
            spacing: { after: 160 },
          }),
        );
        break;
      case 'image': {
        const image = await ctx.loadImage(str(node.attrs?.src));
        if (!image) {
          out.push(
            new Paragraph({
              children: [
                new TextRun({ text: `[${str(node.attrs?.alt) || 'görsel'}]`, italics: true }),
              ],
            }),
          );
          break;
        }
        const scale = Math.min(1, MAX_IMAGE_WIDTH / image.width);
        out.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new ImageRun({
                type: image.type,
                data: image.data,
                transformation: {
                  width: Math.round(image.width * scale),
                  height: Math.round(image.height * scale),
                },
                altText: {
                  name: str(node.attrs?.alt) || 'görsel',
                  description: str(node.attrs?.alt),
                  title: str(node.attrs?.alt),
                },
              }),
            ],
            spacing: { after: 160 },
          }),
        );
        break;
      }
      case 'table': {
        const rows: TableRow[] = [];
        for (const row of node.content ?? []) {
          const cells: TableCell[] = [];
          for (const cell of row.content ?? []) {
            const children = await blocksOf(cell.content ?? [], ctx, 0);
            cells.push(
              new TableCell({
                children: children.length ? children : [new Paragraph({})],
                shading:
                  cell.type === 'tableHeader'
                    ? { type: ShadingType.CLEAR, color: 'auto', fill: 'EEEEF3' }
                    : undefined,
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
              }),
            );
          }
          rows.push(new TableRow({ children: cells }));
        }
        if (rows.length > 0) {
          out.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
          out.push(new Paragraph({ spacing: { after: 120 } }));
        }
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** Tiptap belgesini Word (.docx) belgesine çevirir (Faz 8.6, ADR-106). */
export async function docToDocx(
  title: string,
  content: RichTextNode | null,
  loadImage: ImageLoader,
): Promise<Document> {
  const ctx: Context = { loadImage, orderedRefs: [] };
  const body = await blocksOf(content?.content ?? [], ctx);
  const bulletLevels = [0, 1, 2].map((level) => ({
    level,
    format: LevelFormat.BULLET,
    text: ['•', '◦', '▪'][level]!,
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: (level + 1) * 540, hanging: 270 } } },
  }));
  const orderedLevels = [0, 1, 2].map((level) => ({
    level,
    format: LevelFormat.DECIMAL,
    text: `%${level + 1}.`,
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: (level + 1) * 540, hanging: 360 } } },
  }));
  return new Document({
    creator: 'Egebis Seyir',
    title,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    numbering: {
      config: [
        { reference: BULLET, levels: bulletLevels },
        ...ctx.orderedRefs.map((reference) => ({ reference, levels: orderedLevels })),
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 } } },
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [new TextRun({ text: title, bold: true })],
            spacing: { after: 240 },
          }),
          ...body,
        ],
      },
    ],
  });
}

export async function docToDocxBlob(
  title: string,
  content: RichTextNode | null,
  loadImage: ImageLoader,
): Promise<Blob> {
  return Packer.toBlob(await docToDocx(title, content, loadImage));
}

/** Tarayıcıda görseli çeker; PNG/JPEG/GIF değilse ya da çekilemezse null. */
export const fetchDocxImage: ImageLoader = async (src) => {
  try {
    const res = await fetch(src, { credentials: 'same-origin' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const type =
      blob.type === 'image/png'
        ? 'png'
        : blob.type === 'image/gif'
          ? 'gif'
          : blob.type === 'image/jpeg'
            ? 'jpg'
            : null;
    if (!type) return null;
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return { data: new Uint8Array(await blob.arrayBuffer()), type, ...size };
  } catch {
    return null;
  }
};

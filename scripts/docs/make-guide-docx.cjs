/*
 * Görselli kullanıcı kılavuzu (Word). Uygulama içi Yardım sayfasıyla aynı içerik ve görselleri kullanır:
 *   apps/web/src/features/help/guide.<dil>.json  +  apps/web/public/help/<dil>/*.png
 * Kullanım: NODE_PATH=apps/web/node_modules node scripts/docs/make-guide-docx.cjs <tr|en> <çıktı.docx>
 */
const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  HeadingLevel,
  WidthType,
  ShadingType,
  AlignmentType,
  BorderStyle,
  Footer,
  PageNumber,
  PageBreak,
  LevelFormat,
  VerticalAlign,
} = require('docx');

const [lang, out] = process.argv.slice(2);
if (!['tr', 'en'].includes(lang) || !out) {
  console.error('Kullanım: make-guide-docx.cjs <tr|en> <çıktı.docx>');
  process.exit(1);
}

const root = path.resolve(__dirname, '../../apps/web');
const guide = JSON.parse(
  fs.readFileSync(path.join(root, `src/features/help/guide.${lang}.json`), 'utf8'),
);
const imageDir = path.join(root, 'public/help', lang);

const L = {
  tr: {
    tip: 'İpucu',
    note: 'Not',
    warn: 'Dikkat',
    toc: 'İçindekiler',
    date: 'Sürüm: Ekim 2026',
    page: 'Sayfa',
    figure: 'Görsel',
    legend: 'Görseldeki işaretler',
  },
  en: {
    tip: 'Tip',
    note: 'Note',
    warn: 'Warning',
    toc: 'Contents',
    date: 'Version: October 2026',
    page: 'Page',
    figure: 'Figure',
    legend: 'Markers in the picture',
  },
}[lang];

const FONT = 'Calibri';
const PURPLE = '3B2A9E';
const CONTENT_WIDTH = 9638; // A4 (11906) - 2 × 1134
const MAX_IMAGE_PX = 600;
const MAX_IMAGE_HEIGHT_PX = 430;

/** **kalın** işaretlerini koşullara böler. */
function runs(text, base = {}) {
  return text
    .split('**')
    .map(
      (part, index) =>
        new TextRun({
          text: part,
          font: FONT,
          size: 22,
          ...base,
          bold: index % 2 === 1 || base.bold,
        }),
    );
}
const para = (text, opts = {}) =>
  new Paragraph({ spacing: { after: 140, line: 300 }, ...opts, children: runs(text, opts.run) });

function pngSize(file) {
  const buf = fs.readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), data: buf };
}

const thin = { style: BorderStyle.SINGLE, size: 4, color: 'C9CEDB' };
const allBorders = { top: thin, bottom: thin, left: thin, right: thin };
const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

function badgeCell(n) {
  return new TableCell({
    width: { size: 560, type: WidthType.DXA },
    borders: noBorders,
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 40, bottom: 40, left: 40, right: 60 },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: ` ${n} `,
            bold: true,
            color: 'FFFFFF',
            font: FONT,
            size: 22,
            shading: { type: ShadingType.CLEAR, fill: 'E11D48', color: 'auto' },
          }),
        ],
      }),
    ],
  });
}

function figureBlocks(block) {
  const file = path.join(imageDir, `${block.image}.png`);
  if (!fs.existsSync(file)) throw new Error(`Görsel yok: ${file}`);
  const { width, height, data } = pngSize(file);
  const scale = Math.min(1, MAX_IMAGE_PX / width, MAX_IMAGE_HEIGHT_PX / height);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const items = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 80 },
      keepNext: true,
      children: [
        new ImageRun({
          type: 'png',
          data,
          transformation: { width: w, height: h },
          altText: { title: block.alt, description: block.alt, name: block.image },
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      keepNext: true,
      children: [
        new TextRun({ text: block.caption, italics: true, color: '555B6E', font: FONT, size: 20 }),
      ],
    }),
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [560, CONTENT_WIDTH - 560],
      rows: block.legend.map(
        (text, index) =>
          new TableRow({
            cantSplit: true,
            children: [
              badgeCell(index + 1),
              new TableCell({
                width: { size: CONTENT_WIDTH - 560, type: WidthType.DXA },
                borders: noBorders,
                margins: { top: 40, bottom: 40, left: 60, right: 40 },
                children: [
                  new Paragraph({ spacing: { after: 0 }, children: runs(text, { size: 21 }) }),
                ],
              }),
            ],
          }),
      ),
    }),
    new Paragraph({ spacing: { after: 200 }, children: [] }),
  ];
  return items;
}

const CALLOUT = {
  tip: { fill: 'E7F7EE', bar: '10B981', label: L.tip },
  note: { fill: 'E8F3FB', bar: '0EA5E9', label: L.note },
  warn: { fill: 'FFF4DC', bar: 'F59E0B', label: L.warn },
};

function calloutBlock(block) {
  const c = CALLOUT[block.type];
  return [
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [CONTENT_WIDTH],
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              width: { size: CONTENT_WIDTH, type: WidthType.DXA },
              shading: { type: ShadingType.CLEAR, fill: c.fill, color: 'auto' },
              borders: {
                top: noBorder,
                bottom: noBorder,
                right: noBorder,
                left: { style: BorderStyle.SINGLE, size: 24, color: c.bar },
              },
              margins: { top: 100, bottom: 100, left: 180, right: 140 },
              children: [
                new Paragraph({
                  spacing: { after: 0, line: 290 },
                  children: [
                    new TextRun({ text: `${c.label}: `, bold: true, font: FONT, size: 22 }),
                    ...runs(block.text),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 160 }, children: [] }),
  ];
}

function tableBlock(block) {
  const cols = block.head.length;
  const first = Math.round(CONTENT_WIDTH * (cols === 2 ? 0.34 : 0.22));
  const rest = Math.floor((CONTENT_WIDTH - first) / (cols - 1));
  const widths = [first, ...Array(cols - 1).fill(rest)];
  widths[cols - 1] += CONTENT_WIDTH - widths.reduce((a, b) => a + b, 0);
  const cell = (text, i, header, zebra) =>
    new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      borders: allBorders,
      margins: { top: 70, bottom: 70, left: 110, right: 110 },
      shading: header
        ? { type: ShadingType.CLEAR, fill: '5B3FD1', color: 'auto' }
        : zebra
          ? { type: ShadingType.CLEAR, fill: 'F4F5FA', color: 'auto' }
          : undefined,
      children: [
        new Paragraph({
          spacing: { after: 0, line: 270 },
          children: runs(text, {
            size: 20,
            bold: header || i === 0,
            color: header ? 'FFFFFF' : undefined,
          }),
        }),
      ],
    });
  return [
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: widths,
      rows: [
        new TableRow({
          tableHeader: true,
          cantSplit: true,
          children: block.head.map((h, i) => cell(h, i, true, false)),
        }),
        ...block.rows.map(
          (row, r) =>
            new TableRow({
              cantSplit: true,
              children: row.map((c, i) => cell(c, i, false, r % 2 === 1)),
            }),
        ),
      ],
    }),
    new Paragraph({ spacing: { after: 160 }, children: [] }),
  ];
}

const numberingConfigs = [
  {
    reference: 'dots',
    levels: [
      {
        level: 0,
        format: LevelFormat.BULLET,
        text: '•',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 540, hanging: 270 } } },
      },
    ],
  },
];
let stepLists = 0;

function stepsBlock(block) {
  const reference = `steps-${(stepLists += 1)}`;
  numberingConfigs.push({
    reference,
    levels: [
      {
        level: 0,
        format: LevelFormat.DECIMAL,
        text: '%1.',
        alignment: AlignmentType.LEFT,
        style: {
          paragraph: { indent: { left: 540, hanging: 360 } },
          run: { bold: true, color: PURPLE },
        },
      },
    ],
  });
  return block.items.map(
    (text) =>
      new Paragraph({
        numbering: { reference, level: 0 },
        spacing: { after: 100, line: 290 },
        children: runs(text),
      }),
  );
}

function bulletsBlock(block) {
  return block.items.map(
    (text) =>
      new Paragraph({
        numbering: { reference: 'dots', level: 0 },
        spacing: { after: 80, line: 290 },
        children: runs(text),
      }),
  );
}

function blockToDocx(block) {
  switch (block.type) {
    case 'p':
      return [para(block.text)];
    case 'steps':
      return [...stepsBlock(block), new Paragraph({ spacing: { after: 100 }, children: [] })];
    case 'bullets':
      return [...bulletsBlock(block), new Paragraph({ spacing: { after: 100 }, children: [] })];
    case 'tip':
    case 'note':
    case 'warn':
      return calloutBlock(block);
    case 'table':
      return tableBlock(block);
    case 'figure':
      return figureBlocks(block);
    default:
      throw new Error(`Bilinmeyen blok: ${block.type}`);
  }
}

const heading = (text, level) =>
  new Paragraph({
    heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    keepNext: true,
    children: [
      new TextRun({ text, font: FONT, bold: true, color: PURPLE, size: level === 1 ? 34 : 26 }),
    ],
  });

const cover = [
  new Paragraph({
    spacing: { before: 2600, after: 120 },
    alignment: AlignmentType.LEFT,
    children: [
      new TextRun({
        text: 'EGEBIS',
        font: FONT,
        size: 26,
        color: '7C6BE0',
        bold: true,
        characterSpacing: 120,
      }),
    ],
  }),
  new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text: 'Seyir', font: FONT, size: 96, bold: true, color: PURPLE })],
  }),
  new Paragraph({
    spacing: { after: 160 },
    children: [new TextRun({ text: guide.title, font: FONT, size: 44, bold: true })],
  }),
  new Paragraph({
    spacing: { after: 600 },
    children: [new TextRun({ text: guide.subtitle, font: FONT, size: 26, color: '555B6E' })],
  }),
  new Paragraph({
    children: [new TextRun({ text: L.date, font: FONT, size: 22, color: '7A8094' })],
  }),
  new Paragraph({ children: [new PageBreak()] }),
];

const toc = [
  heading(L.toc, 1),
  ...guide.sections.map(
    (s, i) =>
      new Paragraph({
        spacing: { after: 100 },
        children: [new TextRun({ text: `${i === 0 ? '' : ''}${s.title}`, font: FONT, size: 24 })],
      }),
  ),
  new Paragraph({ children: [new PageBreak()] }),
];

const body = guide.sections.flatMap((section) => [
  heading(section.title, 1),
  ...section.blocks.flatMap(blockToDocx),
]);

const doc = new Document({
  creator: 'Egebis Seyir',
  title: guide.title,
  description: guide.subtitle,
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 34, bold: true, font: FONT, color: PURPLE },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 },
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 26, bold: true, font: FONT, color: PURPLE },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 1 },
      },
    ],
  },
  numbering: { config: numberingConfigs },
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: `Egebis Seyir · ${L.page} `,
                  font: FONT,
                  size: 18,
                  color: '7A8094',
                }),
                new TextRun({
                  children: [PageNumber.CURRENT],
                  font: FONT,
                  size: 18,
                  color: '7A8094',
                }),
              ],
            }),
          ],
        }),
      },
      children: [...cover, ...toc, ...body],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(out, buf);
  console.log('ok', out, buf.length);
});

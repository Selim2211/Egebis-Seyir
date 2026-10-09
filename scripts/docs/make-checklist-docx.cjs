// docs/plans/clickup-checklist.md → docs/Egebis-Seyir-ClickUp-Karsilastirma.docx
// Kullanım: node scripts/docs/make-checklist-docx.cjs docs/plans/clickup-checklist.md docs/Egebis-Seyir-ClickUp-Karsilastirma.docx
// ('docx' paketi apps/web bağımlılığıdır: NODE_PATH=apps/web/node_modules)
const fs = require('fs');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  BorderStyle,
  AlignmentType,
  LevelFormat,
  PageOrientation,
} = require('docx');

const [src, out] = process.argv.slice(2);
const md = fs.readFileSync(src, 'utf8');
const BRAND = '4F46E5';
const GREY = '62626B';
const STATUS = {
  '✅': { text: 'Var', fill: 'DCFCE7', color: '166534' },
  '🟡': { text: 'Kısmen', fill: 'FEF3C7', color: '92400E' },
  '❌': { text: 'Yok', fill: 'FEE2E2', color: '991B1B' },
};
const W = [4300, 1100, 3600, 5000]; // yatay A4 içerik genişliği ≈ 14000 DXA

const clean = (t) => t.replace(/\*\*/g, '').replace(/`/g, '').trim();
// "**F8 (8.5)** — x" gibi parçaları kalın/normal koşulara böler.
function runs(t, opts = {}) {
  const parts = t
    .trim()
    .replace(/`/g, '')
    .split(/(\*\*[^*]+\*\*)/);
  return parts
    .filter(Boolean)
    .map((p) =>
      p.startsWith('**')
        ? new TextRun({ text: p.slice(2, -2), bold: true, size: 18, ...opts })
        : new TextRun({ text: p, size: 18, ...opts }),
    );
}
const border = { style: BorderStyle.SINGLE, size: 4, color: 'D9D9E3' };
const borders = { top: border, bottom: border, left: border, right: border };
const cell = (children, i, fill) =>
  new TableCell({
    width: { size: W[i], type: WidthType.DXA },
    borders,
    shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children })],
  });

const children = [
  new Paragraph({
    children: [
      new TextRun({
        text: 'EGEBIS SEYİR',
        bold: true,
        size: 22,
        color: BRAND,
        characterSpacing: 60,
      }),
    ],
  }),
  new Paragraph({
    heading: HeadingLevel.TITLE,
    spacing: { after: 120 },
    children: [new TextRun({ text: 'ClickUp Fonksiyon Karşılaştırması', bold: true, size: 48 })],
  }),
  new Paragraph({
    spacing: { after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: BRAND, space: 8 } },
    children: [
      new TextRun({
        text: 'Her fonksiyon için: Seyir’de var mı, varsa ClickUp’taki gibi gerçekten çalışıyor mu?',
        size: 22,
        color: GREY,
      }),
    ],
  }),
];

let rows = null;
const flush = () => {
  if (!rows) return;
  children.push(
    new Table({
      width: { size: W.reduce((a, b) => a + b), type: WidthType.DXA },
      columnWidths: W,
      rows,
    }),
  );
  rows = null;
};
for (const line of md.split('\n')) {
  if (line.startsWith('# ')) continue;
  if (line.startsWith('## ')) {
    flush();
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        keepNext: true,
        spacing: { before: 280, after: 100 },
        children: [new TextRun({ text: clean(line.slice(3)), bold: true, size: 28, color: BRAND })],
      }),
    );
    continue;
  }
  if (line.startsWith('> ')) {
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        children: runs(line.slice(2), { color: GREY, size: 19 }),
      }),
    );
    continue;
  }
  if (line.startsWith('- ')) {
    flush();
    children.push(
      new Paragraph({
        numbering: { reference: 'bullets', level: 0 },
        spacing: { after: 60 },
        children: runs(line.slice(2), { size: 21 }),
      }),
    );
    continue;
  }
  if (line.startsWith('|')) {
    const cols = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (/^-+$/.test(cols[0].replace(/:/g, ''))) continue;
    if (cols[0] === 'ClickUp fonksiyonu') {
      flush();
      rows = [
        new TableRow({
          tableHeader: true,
          children: ['ClickUp fonksiyonu', 'Seyir’de', 'ClickUp gibi çalışıyor mu', 'Not'].map(
            (h, i) =>
              cell([new TextRun({ text: h, bold: true, size: 18, color: 'FFFFFF' })], i, BRAND),
          ),
        }),
      ];
      continue;
    }
    const st = STATUS[Object.keys(STATUS).find((k) => cols[1].includes(k))] ?? {
      text: cols[1],
      fill: undefined,
      color: '000000',
    };
    const works = cols[2] === '—' ? '' : cols[2];
    rows.push(
      new TableRow({
        children: [
          cell(runs(cols[0]), 0),
          cell([new TextRun({ text: st.text, bold: true, size: 18, color: st.color })], 1, st.fill),
          cell(runs(works, works.startsWith('Doğrulanmadı') ? { color: '92400E' } : {}), 2),
          cell(runs(cols[3] ?? ''), 3),
        ],
      }),
    );
  }
}
flush();

const doc = new Document({
  creator: 'Egebis Seyir',
  title: 'Egebis Seyir - ClickUp Karşılaştırması',
  styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
  numbering: {
    config: [
      {
        reference: 'bullets',
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
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE },
          margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
        },
      },
      children,
    },
  ],
});
Packer.toBuffer(doc).then((b) => {
  fs.writeFileSync(out, b);
  console.log('ok', b.length);
});

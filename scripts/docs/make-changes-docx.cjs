/* Yapılan değişiklikler Word notu. Kullanım: node make-changes-docx.cjs <çıktı.docx> */
const fs = require('fs');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  WidthType,
  ShadingType,
  AlignmentType,
  BorderStyle,
} = require('docx');

const [out] = process.argv.slice(2);

const requests = [
  {
    no: 1,
    ask: 'Her task için Story Point (SP) değeri girilebilecek, değiştirilebilecek.',
    done: 'Task, Bug, Story ve Sub-task dahil her iş öğesinde Story Point girilir ve değiştirilir. Görev detayında “Story Point” alanı, tabloda satır içi seçim vardır.',
    use: 'Görevi aç → sağ panelde “Story Point” listesinden değer seç.',
    proof: 'API testi + tarayıcı testi (faz9-points)',
  },
  {
    no: 2,
    ask: 'Geçerli SP değerleri 1, 2, 3, 5, 8, 13, 21, 34, 55.',
    done: 'Fibonacci ölçeği tam bu dokuz değerle sınırlandı. Listede başka değer yoktur; API de ölçek dışı değeri (4, 56, 89 gibi) reddeder.',
    use: 'Seçim listesinde yalnızca bu değerler görünür.',
    proof: 'Birim + API + tarayıcı testi',
  },
  {
    no: 3,
    ask: 'Taskin subtaskları varsa SP değeri bunların toplamı olacak.',
    done: 'Sub-task’ı olan görevin puanı alt görevlerin toplamıdır; alt görev eklenince, puanı değişince, silinince ya da geri alınınca otomatik güncellenir. Üst görevde alan kilitlidir ve “Alt görevlerin toplamı” notu görünür.',
    use: 'Görev altına alt görev ekle, her birine puan ver; üst görevin puanı kendiliğinden toplanır.',
    proof: 'API + tarayıcı testi',
  },
  {
    no: 4,
    ask: 'Subtask’lar giderse task normal task olur, SP girilebilir hale gelir.',
    done: 'Son alt görev silinince/taşınınca üst görevin kilidi açılır. Son toplam değeri kalır, istenirse yeni değer girilir.',
    use: 'Alt görevleri sil → üst görevde Story Point yeniden düzenlenebilir olur.',
    proof: 'API testi',
  },
  {
    no: 5,
    ask: 'Sprint özelliklerinde toplam SP gösterilecek, kişilere bağlı dağılım görüntülenebilecek.',
    done: 'Sprint özeti: toplam puan, biten puan ve kişi başına puan/yüzde dağılımı. Birden çok kişiye atanmış işin puanı eşit bölünür; atanmamış işler ayrı satırda görünür.',
    use: 'Backlog’da sprint başlığındaki yüzde düğmesine tıkla; Sprint panosunda “Özet” düğmesi.',
    proof: 'Birim + API + tarayıcı testi',
  },
  {
    no: 6,
    ask: 'Tasklar önem derecesine göre istenirse renklendirilebilecek.',
    done: '“Önceliğe göre renklendir” düğmesi: Backlog satırları ve Sprint panosu kartları öncelik rengiyle (Acil, Yüksek, Normal, Düşük) boyanır. Tercih kullanıcıya özeldir, tarayıcıda saklanır.',
    use: 'Backlog veya Sprint panosunun üstündeki düğmeyle aç/kapat.',
    proof: 'Tarayıcı testi',
  },
  {
    no: 7,
    ask: 'Kullanıcı kendisine atanan taskin yüzde kaçını bitirdiğini girebilecek.',
    done: 'Görev detayında “Tamamlanma” kaydırıcısı (%0–100, 5’er adım). Atanan kişi ya da yazma yetkisi olan girer. Alt görevi olan işte yüzde alt görevlerden hesaplanır; Epic’te girilmez. Kartlarda ve satırlarda yüzde görünür.',
    use: 'Görevi aç → “Tamamlanma” çubuğunu sürükle.',
    proof: 'API + tarayıcı testi',
  },
  {
    no: 8,
    ask: 'Sprint özelliklerinde toplam bitirme yüzdesi görülebilecek.',
    done: 'Sprint toplam yüzdesi puan ağırlıklı hesaplanır (Done durumundaki iş %100 sayılır). Sprint başlığında ve özet panelinde görünür.',
    use: 'Sprint başlığındaki yüzde rozeti / Özet paneli.',
    proof: 'Birim + API + tarayıcı testi',
  },
  {
    no: 9,
    ask: 'Yazılımda her sprint için Kanban Board eklenebilecek. Bu nedir araştır.',
    done: 'Kanban, işlerin durum sütunlarında (Yapılacak, Sürüyor, Bitti) kartlarla izlendiği panodur; kart sürüklenerek durum değişir, WIP limitiyle aynı anda yürüyen iş sınırlanır. Seyir’de her sprint için “Sprint panosu” zaten vardı; sprint menüsüne “Kanban panosunu aç” kısayolu eklendi.',
    use: 'Sprint menüsü (⋯) → “Kanban panosunu aç”, ya da Sprint panosu sekmesinde sprint seç.',
    proof: 'Tarayıcı testi',
  },
  {
    no: 10,
    ask: 'JSON temelli sprint exportu olabilecek.',
    done: 'Sprint JSON olarak indirilir: sprint bilgileri, toplam puan/yüzde, kişi dağılımı, tüm öğeler (alt görevler dahil), bağımlılıklar ve her kaydın bağlantısı. Biçim adı “egebis-seyir.sprint”, sürüm 1.',
    use: 'Sprint menüsü (⋯) → “JSON olarak indir”.',
    proof: 'API + tarayıcı testi',
  },
  {
    no: 11,
    ask: 'Her bir task veya sprintin URL adresi olacak.',
    done: 'Görev adresi /items/MOB-12 biçiminde zaten vardı. Sprint için /sprints/<kimlik> adresi eklendi; sprint panosunu açar. Menüden ve panodan “Bağlantıyı kopyala” yapılır.',
    use: 'Sprint menüsü → “Bağlantıyı kopyala”; görevde anahtara (MOB-12) tıklamak bağlantıyı kopyalar.',
    proof: 'Tarayıcı testi',
  },
];

const FONT = 'Calibri';
const text = (t, o = {}) => new TextRun({ text: t, font: FONT, size: 22, ...o });
const para = (t, o = {}) => new Paragraph({ spacing: { after: 120 }, children: [text(t, o)] });
const bullet = (t) =>
  new Paragraph({
    numbering: { reference: 'dots', level: 0 },
    spacing: { after: 60 },
    children: [text(t)],
  });

const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFC5D2' };
const borders = { top: border, bottom: border, left: border, right: border };
const WIDTHS = [600, 2400, 3600, 2760];
const cell = (children, i, shade) =>
  new TableCell({
    borders,
    width: { size: WIDTHS[i], type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    shading: shade ? { fill: shade, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    children,
  });
const cellText = (t, o = {}) => [new Paragraph({ children: [text(t, { size: 20, ...o })] })];

const summaryTable = new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: WIDTHS,
  rows: [
    new TableRow({
      tableHeader: true,
      children: ['No', 'Konu', 'Yapılan', 'Nasıl kullanılır'].map((h, i) =>
        cell(cellText(h, { bold: true, color: 'FFFFFF' }), i, '5B3FD1'),
      ),
    }),
    ...requests.map(
      (r, idx) =>
        new TableRow({
          children: [
            cell(cellText(String(r.no), { bold: true }), 0, idx % 2 ? 'F4F5FA' : undefined),
            cell(cellText(r.ask), 1, idx % 2 ? 'F4F5FA' : undefined),
            cell(cellText(r.done), 2, idx % 2 ? 'F4F5FA' : undefined),
            cell(cellText(r.use), 3, idx % 2 ? 'F4F5FA' : undefined),
          ],
        }),
    ),
  ],
});

const doc = new Document({
  creator: 'Egebis Seyir',
  title: 'Egebis Seyir — Yapılan Değişiklikler',
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 32, bold: true, font: FONT, color: '3B2A9E' },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 0 },
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 26, bold: true, font: FONT, color: '3B2A9E' },
        paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 1 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: 'dots',
        levels: [
          {
            level: 0,
            format: 'bullet',
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
          size: { width: 11906, height: 16838 },
          margin: { top: 1134, bottom: 1134, left: 1273, right: 1273 },
        },
      },
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [
            text('Egebis Seyir — Yapılan Değişiklikler', { size: 32, bold: true, color: '3B2A9E' }),
          ],
        }),
        para('Tarih: 12.10.2026 · Karar kaydı: ADR-107'),
        para(
          '11 maddenin hepsi uygulandı ve test edildi. Aşağıda her madde için konu, yapılan değişiklik ve kullanımı yer alıyor.',
        ),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [text('1. Özet tablo', { size: 26, bold: true, color: '3B2A9E' })],
        }),
        summaryTable,

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [text('2. Önemli kurallar', { size: 26, bold: true, color: '3B2A9E' })],
        }),
        bullet(
          'Story Point her iş tipinde girilir; Fibonacci ölçeği 1, 2, 3, 5, 8, 13, 21, 34, 55 ile sınırlıdır. Saat tahmini Task ve Sub-task’ta ayrıca durur.',
        ),
        bullet(
          'Sub-task’ı olan işin puanı ve yüzdesi alt görevlerden hesaplanır, elle değiştirilemez. Son alt görev kalkınca puan yeniden elle girilir.',
        ),
        bullet(
          'Yüzde puan ağırlıklı ortalamadır; puanı olmayan işlerde her iş eşit ağırlıktadır. Done durumundaki iş %100 sayılır.',
        ),
        bullet(
          'Birden çok kişiye atanmış işin puanı kişiler arasında eşit bölünür; böylece kişi toplamları sprint toplamına eşit kalır.',
        ),
        bullet(
          'Önceliğe göre renklendirme kişiye özel bir görünüm tercihidir, başkalarını etkilemez.',
        ),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [text('3. Sınırlar', { size: 26, bold: true, color: '3B2A9E' })],
        }),
        bullet(
          'Excel/CSV ile içe aktarılan bir üst işin puanı, bir sonraki alt görev değişikliğine kadar alt görev toplamını ezebilir.',
        ),
        bullet('Yüzde işe tek değer olarak girilir; her atanan için ayrı yüzde tutulmaz.'),
        bullet('JSON yalnızca dışa aktarılır; içe aktarma için Excel ya da zip yedek kullanılır.'),
        bullet(
          'Tabloda Task’ın saat tahmini artık satır içinde değil, görev detayında düzenlenir.',
        ),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [text('4. Test sonucu', { size: 26, bold: true, color: '3B2A9E' })],
        }),
        bullet('Otomatik API testleri: 47 dosya, 365 test geçti (bu iş için 5 yeni test).'),
        bullet(
          'Tarayıcı testleri: 112 test geçti; bu iş için 7 yeni uçtan uca test yazıldı ve geçti.',
        ),
        bullet(
          'Tam setteki 4 hatanın ikisi (e-posta davet testi için Mailpit yok; webhook testi eski test verisine takılıyor) önceden de vardı. Diğer ikisi tek başına çalıştırılınca geçti.',
        ),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [text('5. Sunucuya alma', { size: 26, bold: true, color: '3B2A9E' })],
        }),
        para(
          'Sunucuda “git pull” ve “docker compose up -d --build” yeterlidir. Yeni veritabanı değişikliği (migration) başlangıçta kendiliğinden uygulanır.',
        ),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(out, buf);
  console.log('ok', buf.length);
});

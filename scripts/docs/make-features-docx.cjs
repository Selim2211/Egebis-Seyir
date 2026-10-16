const fs = require('fs');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  LevelFormat,
  BorderStyle,
} = require('docx');

const BRAND = '4F46E5';
const GREY = '62626B';

const sections = [
  {
    title: '1. Proje ve görev yönetimi',
    intro: 'Ekibin işlerini tek yerde planlayıp takip etmek için.',
    items: [
      'Space, klasör ve liste yapısıyla işleri düzenli gruplayabilirsin.',
      'Epic, Task, Sub-Task ve Bug oluşturabilirsin.',
      'Her göreve atanan kişi, öncelik, başlangıç/bitiş tarihi, etiket ve açıklama ekleyebilirsin.',
      'Göreve kontrol listesi, dosya eki, yorum ve bağlantı (bloklar, ilişkili) ekleyebilirsin.',
      'İşleri liste, tablo, pano (Kanban) ve takvim görünümünde görebilirsin.',
      'Filtreleyip sıralayıp bu görünümü kaydedip ekiple paylaşabilirsin.',
      'Birden çok görevi seçip toplu güncelleyebilirsin.',
      'Görevi kopyalayabilir, taşıyabilir, arşivleyebilir ya da çöp kutusuna atıp geri alabilirsin.',
      'Kendi alanlarını (özel alan) tanımlayıp görevlere ekleyebilirsin.',
      'Görev durumlarını (iş akışını) Space’e göre kendin belirleyebilir, bir sütunda en fazla kaç iş olacağını sınırlayabilirsin.',
      'Sık yapılan işler için şablon kaydedip tek tıkla yeniden kullanabilirsin.',
    ],
  },
  {
    title: '2. Scrum (sprint) çalışması',
    intro: 'Scrum ile çalışan ekipler için.',
    items: [
      'Ürün bekleme listesini (backlog) önem sırasına göre sürükleyerek sıralayabilirsin.',
      'Sprint oluşturup işleri sprint’e ekleyebilir, başlatıp tamamlayabilirsin.',
      'Sol menüde “Backlog ve sprint’ler” satırını açınca Space’in tüm sprint’lerini listede görürsün.',
      'İşleri Backlog’dan sprint’e, sprint’ten Backlog’a ve sprint’ler arasında sürükleyerek ya da menüden taşıyabilirsin.',
      'Bir işi başka işin üstüne sağa doğru bırakırsan onun alt işi olur (Task, Sub-task’a dönüşür; üstteki işin tipi değişmez).',
      'Sprint ya da Backlog listesini panoya kopyalayıp Excel’e yapıştırabilirsin.',
      'Sprint’i işleri, özellikleri (atanan, öncelik, puan, tarih…), alt işleri ve bağımlılıklarıyla Excel’e aktarabilir, aynı dosyayı geri alabilirsin.',
      'Bir Space’i ya da tek bir sprint’i zip dosyası olarak yedekleyip yeniden yükleyebilirsin (yorum, checklist ve ek dosyalar dahil).',
      'İş numarasına (ör. MOB-12) tıklayınca o işin bağlantısı kopyalanır; bağlantı işi doğrudan açar.',
      'Biten sprint’te tamamlanmayan işleri bir sonraki sprint’e devredebilirsin.',
      'Pano üzerinde işleri sürükleyerek durumunu değiştirebilirsin.',
      'Task’lara Story Point verebilir, “Tamamlandı tanımı” (DoD) ve “Hazır tanımı” (DoR) listeleri tutabilirsin.',
      'Sprint sonu özeti (review) ve retrospektif sayfasını kullanabilirsin; retrospektiften doğrudan görev açabilirsin.',
      'Burndown, velocity ve akış grafiklerini görebilirsin.',
      'Epik’lerin ilerlemesini ve yol haritasını (roadmap) görebilirsin.',
    ],
  },
  {
    title: '3. Planlama ve zaman',
    intro: 'Takvim ve iş yükü için.',
    items: [
      'Gantt şemasında işleri çubuk olarak görebilir, sürükleyerek tarihlerini kaydırabilirsin.',
      'Bir işi kaydırınca ona bağlı işler de otomatik kayar (istersen kapatabilirsin).',
      'Görevler arasındaki bağımlılıklar oklarla gösterilir; kritik yol ve çakışmalar işaretlenir.',
      'Kişi bazlı iş yükü görünümüyle kimin ne kadar yüklü olduğunu görebilirsin.',
      'Göreve zamanlayıcı başlatıp ya da elle süre girebilir, zaman çizelgesini (timesheet) görebilirsin.',
      'Tekrarlayan görev kurabilirsin (günlük, haftalık, aylık, yıllık). Görevi bitirince bir sonraki otomatik oluşur.',
      'Göreve kişisel hatırlatıcı kurabilirsin; zamanı gelince bildirim ve e-posta gelir.',
    ],
  },
  {
    title: '4. Doküman yönetimi',
    intro: 'Proje bilgisini tek yerde saklamak için.',
    items: [
      'Her Space içinde doküman sayfaları yazabilir, sayfaları ağaç düzeninde alt sayfalarla düzenleyebilirsin.',
      'Başlık, liste, tablo, kod bloğu, bağlantı ve onay kutulu görev listesi ekleyebilirsin.',
      'Yazdıkların otomatik kaydedilir; eski sürümlere dönebilir, sürümler arası farkı görebilirsin.',
      'Sayfaya dosya ekleyebilirsin.',
      'Sayfaya görev bağlayabilir, sayfada yorum yazıp birini etiketleyebilirsin.',
      'Sayfayı Markdown ya da Word (.docx) olarak indirebilir, yazdırıp PDF yapabilirsin.',
      'Sayfaya görsel ekleyebilirsin (düğmeyle, panodan yapıştırarak ya da sürükleyerek).',
      'Yazarken Geri al / Yinele (Ctrl+Z, Ctrl+Shift+Z) kullanabilirsin.',
      'Silinen sayfaları 30 gün boyunca çöp kutusundan geri alabilirsin.',
      'Sayfaları şablondan oluşturabilirsin.',
    ],
  },
  {
    title: '5. Ekip, iletişim ve bildirim',
    intro: 'Birlikte çalışmayı kolaylaştırmak için.',
    items: [
      'Yöneticiler e-posta göndermeden doğrudan yeni hesap açabilir; ya da e-postayla davet edebilir.',
      'Kişilere rol verebilirsin: Sahip, Yönetici, Üye, Misafir.',
      'Misafirler yalnızca paylaştığın Space’leri görür.',
      'Kullanıcıları ekiplere ayırıp bir göreve ekibi tek tıkla atayabilirsin.',
      'Ekip arkadaşınla birebir mesajlaşabilirsin; okunmamış mesaj sayısı menüde görünür.',
      'Yorumlarda @ ile kişi etiketleyebilirsin, emoji ile tepki verebilirsin.',
      'Atandığında, etiketlendiğinde ya da durum değiştiğinde uygulama içi bildirim ve e-posta alırsın; hangisini istediğini ayarlardan seçersin.',
      'Her işin ve her sayfanın değişiklik geçmişini görebilirsin.',
      'Yönetici ve Sahipler, Ayarlar’daki Denetim günlüğünden kimin ne zaman ne yaptığını görür; kişiye, türe ve tarihe göre süzer, CSV indirir.',
    ],
  },
  {
    title: '6. Hedefler, formlar ve otomasyon',
    intro: 'İşleri hızlandıran ve toplayan özellikler.',
    items: [
      'Hedef (Goal) oluşturabilirsin: ya bağlı görevlerin tamamlanma oranıyla ya da bir sayıyla (ör. satış 0 → 200) ilerlemeyi izlersin.',
      'Form hazırlayıp ekibin ya da görüntüleyicilerin talep ve hata bildirimini doğrudan görev olarak açmasını sağlayabilirsin.',
      'Otomasyon kuralları yazabilirsin: örneğin “durum Bitti olunca bana bildir” ya da “yeni hata açılınca etiket ekle”.',
      'Webhook ile başka sistemlere olay bildirimi gönderebilirsin.',
      'GitHub, GitLab gibi kod depolarını bağlayıp commit ve pull request’leri görevle eşleştirebilirsin.',
      'API anahtarı oluşturup kendi araçlarından uygulamaya erişebilirsin.',
      'Yapay zekâ yardımcısıyla görev açıklaması ya da kabul kriteri önerisi alabilirsin (anahtar tanımlıysa).',
    ],
  },
  {
    title: '7. Arama, veri ve diğer',
    intro: 'Günlük kullanımı kolaylaştıran özellikler.',
    items: [
      'Üstteki arama kutusundan (Ctrl+K) görev, doküman sayfası ya da görev numarasıyla (ör. MOB-12) arama yapabilirsin.',
      '“Bana atananlar” sayfasında sana atanan, senin açtığın ve izlediğin işleri görebilirsin.',
      'Ana sayfada yaklaşan teslimleri, favorilerini ve son hareketleri görebilirsin.',
      'Başka araçlardan CSV ile görev aktarabilir, görevleri CSV olarak dışa aktarabilirsin.',
      'Türkçe ve İngilizce arayüz, açık ve koyu tema seçebilirsin.',
      'Telefon ve tablette de kullanabilirsin (mobil uyumlu).',
      'Oturumlarını görüp başka cihazlardaki oturumları kapatabilirsin.',
    ],
  },
];

const notYet = [
  'Birden fazla kişiye aynı anda canlı düzenleme (iki kişi aynı sayfayı aynı anda yazması) henüz yok.',
  'Grup sohbetleri ve kanal tipi mesajlaşma henüz yok; yalnızca birebir mesaj var.',
  'Takvim eşitleme (Google/Outlook) ve Jira/Trello’dan aktarma henüz yok.',
  'Gantt’ta baseline (planlanan tarih karşılaştırması) henüz yok.',
  'Kişi ve rol bazlı ayrıntılı yetkiler sonraki aşamada gelecek.',
];

const children = [];
children.push(
  new Paragraph({
    spacing: { before: 0, after: 80 },
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
    children: [new TextRun({ text: 'Uygulama Özellikleri', bold: true, size: 52 })],
  }),
  new Paragraph({
    spacing: { after: 280 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: BRAND, space: 8 } },
    children: [
      new TextRun({
        text: 'Egebis Seyir ile neler yapabilirsin? Basit bir özet.',
        size: 24,
        color: GREY,
      }),
    ],
  }),
  new Paragraph({
    spacing: { after: 280 },
    children: [
      new TextRun({
        text: 'Egebis Seyir, ekiplerin işlerini, sprintlerini ve proje belgelerini tek yerden yönetmesi için hazırlanmış bir proje yönetim uygulamasıdır. Aşağıda, uygulamada bugün neler yapabildiğin konu konu listelendi.',
        size: 22,
      }),
    ],
  }),
);

for (const s of sections) {
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      keepNext: true,
      spacing: { before: 320, after: 80 },
      children: [new TextRun({ text: s.title, bold: true, size: 30, color: BRAND })],
    }),
    new Paragraph({
      keepNext: true,
      spacing: { after: 120 },
      children: [new TextRun({ text: s.intro, italics: true, size: 21, color: GREY })],
    }),
  );
  for (const item of s.items) {
    children.push(
      new Paragraph({
        numbering: { reference: 'bullets', level: 0 },
        spacing: { after: 70 },
        children: [new TextRun({ text: item, size: 22 })],
      }),
    );
  }
}

children.push(
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    keepNext: true,
    spacing: { before: 360, after: 120 },
    children: [new TextRun({ text: 'Henüz olmayanlar', bold: true, size: 30, color: BRAND })],
  }),
);
for (const item of notYet) {
  children.push(
    new Paragraph({
      numbering: { reference: 'bullets', level: 0 },
      spacing: { after: 70 },
      children: [new TextRun({ text: item, size: 22 })],
    }),
  );
}

const doc = new Document({
  creator: 'Egebis Seyir',
  title: 'Egebis Seyir - Uygulama Özellikleri',
  styles: {
    default: { document: { run: { font: 'Calibri', size: 22 } } },
    paragraphStyles: [
      {
        id: 'Title',
        name: 'Title',
        basedOn: 'Normal',
        next: 'Normal',
        run: { font: 'Calibri', size: 52, bold: true },
      },
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: 'Calibri', size: 30, bold: true, color: BRAND },
        paragraph: { outlineLevel: 0 },
      },
    ],
  },
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
          size: { width: 11906, height: 16838 },
          margin: { top: 1300, right: 1300, bottom: 1300, left: 1300 },
        },
      },
      children,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(process.argv[2], buf);
  console.log('ok', buf.length);
});

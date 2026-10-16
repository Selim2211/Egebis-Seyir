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
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
} = require('docx');

const BRAND = '4F46E5';
const GREY = '62626B';
const W = 9306; // A4 içerik genişliği (DXA)

const p = (text, o = {}) =>
  new Paragraph({
    spacing: { after: o.after ?? 100 },
    keepNext: o.keepNext,
    children: [
      new TextRun({ text, size: o.size ?? 22, bold: o.bold, italics: o.italics, color: o.color }),
    ],
  });
const h1 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    keepNext: true,
    spacing: { before: 360, after: 100 },
    children: [new TextRun({ text, bold: true, size: 30, color: BRAND })],
  });
const h2 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
    spacing: { before: 200, after: 70 },
    children: [new TextRun({ text, bold: true, size: 24 })],
  });
const step = (text) =>
  new Paragraph({
    numbering: { reference: 'steps', level: 0 },
    spacing: { after: 70 },
    children: [new TextRun({ text, size: 22 })],
  });
const bullet = (text) =>
  new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, size: 22 })],
  });
const note = (label, text) => {
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'C7D2FE' };
  return new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: [W],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: W, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: 'EEF2FF', color: 'auto' },
            margins: { top: 100, bottom: 100, left: 160, right: 160 },
            borders: {
              top: border,
              bottom: border,
              left: { ...border, size: 18, color: BRAND },
              right: border,
            },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: label + ' ', bold: true, color: BRAND, size: 21 }),
                  new TextRun({ text, size: 21 }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
};
const gap = () => new Paragraph({ spacing: { after: 60 }, children: [] });

// Her bölümde numaralı adımlar yeniden 1'den başlasın diye ayrı numaralandırma örnekleri.
let stepRef = 0;
const stepsConfigs = [];
const steps = (items) => {
  const ref = `steps${++stepRef}`;
  stepsConfigs.push({
    reference: ref,
    levels: [
      {
        level: 0,
        format: LevelFormat.DECIMAL,
        text: '%1.',
        alignment: AlignmentType.LEFT,
        style: {
          paragraph: { indent: { left: 540, hanging: 360 } },
          run: { bold: true, color: BRAND },
        },
      },
    ],
  });
  return items.map(
    (text) =>
      new Paragraph({
        numbering: { reference: ref, level: 0 },
        spacing: { after: 70 },
        children: [new TextRun({ text, size: 22 })],
      }),
  );
};

const c = [];
c.push(
  new Paragraph({
    spacing: { after: 80 },
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
    children: [new TextRun({ text: 'Kullanım Kılavuzu', bold: true, size: 52 })],
  }),
  new Paragraph({
    spacing: { after: 280 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: BRAND, space: 8 } },
    children: [
      new TextRun({ text: 'Uygulamayı denemek için adım adım rehber.', size: 24, color: GREY }),
    ],
  }),
  p(
    'Bu kılavuz, uygulamayı ilk kez denerken ne yapman gerektiğini sırayla anlatır. Önce uygulamayı açacak, sonra küçük bir örnek proje kurup temel özellikleri deneyeceksin. Baştan sona yaklaşık 20 dakika sürer.',
  ),
);

c.push(h1('1. Uygulamayı açma'));
c.push(h2('Bilgisayarında deneme (yerel)'));
c.push(
  ...steps([
    'Bilgisayarında PostgreSQL veritabanının çalıştığından emin ol (Windows’ta “postgresql-18” hizmeti).',
    'Proje klasöründe (C:\\dev\\scrum-manager) şu komutu çalıştır: pnpm dev. İlk açılışta API’nin derlenmesi yarım dakika kadar sürer.',
    'Tarayıcıda şu adresi aç: http://localhost:5173',
    'Sayfa “Beklenmeyen bir hata oluştu” ya da “502” derse yarım dakika bekleyip yenile; sunucu hâlâ açılıyordur.',
  ]),
);
c.push(
  note(
    'İpucu:',
    'Claude ile çalışıyorsan “localde başlat” yazman yeterli; sunucuyu o başlatır ve adresi söyler.',
  ),
);
c.push(gap());
c.push(h2('İlk giriş'));
c.push(
  ...steps([
    'Uygulamayı ilk kez kuruyorsan açılış ekranı “İlk kurulum” ister: kurumun adını, adını, e-postanı ve şifreni gir. Bu ilk kullanıcı otomatik olarak “Sahip” olur.',
    'Daha önce kurulmuşsa e-posta ve şifrenle giriş yap.',
    'Şifreni unuttuysan giriş ekranındaki “Şifremi unuttum” bağlantısını kullan; e-posta gelir (spam klasörüne de bak).',
  ]),
);

c.push(h1('2. Ekranı tanıma'));
c.push(p('Sol menü her yerde aynıdır:'));
for (const t of [
  'Ana Sayfa: sana atanan işler, yaklaşan teslimler, favoriler ve son hareketler.',
  'Bana atananlar: sana atanan, senin açtığın ve izlediğin tüm işler.',
  'Hedefler: ekibin hedefleri ve ilerleme çubukları.',
  'Mesajlar: ekip arkadaşlarınla birebir yazışma (okunmamış sayısı rozet olarak görünür).',
  'Bildirimler: sana gelen bildirimler.',
  'Space’ler: projelerin. Her Space’in altında klasörler, listeler ve kendi sayfaları vardır.',
  'Alt kısımda Üye davet et, Ayarlar ve (varsa) Tasarım sistemi bulunur.',
])
  c.push(bullet(t));
c.push(
  p(
    'Üstteki arama kutusundan (kısayol: Ctrl+K) görev, doküman sayfası ya da görev numarası (örneğin MOB-12) arayabilirsin. Sağ üstteki yuvarlak simgeden dil, tema (açık/koyu) ve çıkış menüsüne ulaşırsın.',
  ),
);

c.push(h1('3. Örnek proje kurma'));
c.push(h2('Space oluşturma'));
c.push(p('Space, bir ürünün ya da ekibin tüm işlerini tuttuğun ana kutudur.'));
c.push(
  ...steps([
    'Sol menüde “Space’ler” başlığının yanındaki “+” ya da “Space oluştur” düğmesine tıkla.',
    'Ad yaz (örneğin “Mobil Uygulama”). Anahtar kendiliğinden gelir (MOB); görevlerin numaraları bu anahtarla başlar: MOB-1, MOB-2…',
    'Renk ve simge seç. Çalışma modunda “Scrum” seçersen sprint ve backlog özellikleri açılır; “Basit liste” seçersen yalnızca liste ve görevler olur.',
    '“Space oluştur” düğmesine bas.',
  ]),
);
c.push(gap());
c.push(h2('Görev ekleme'));
c.push(
  ...steps([
    'Space’in altındaki “Görevler” listesini aç.',
    'Üstteki “Başlık” kutusuna görev adını yaz, tür seç (Task, Epic, Bug…) ve Enter’a bas. Görev “MOB-1 oluşturuldu” mesajıyla eklenir.',
    'Birkaç görev daha ekle: “Giriş ekranı”, “Ödeme sayfası”, “Raporlar”.',
    'Bir görevin başlığına tıklayınca sağda detay paneli açılır.',
  ]),
);
c.push(gap());
c.push(h2('Görev detayında neler yapılır'));
for (const t of [
  'Durumu değiştir (Yapılacak → Devam ediyor → Tamamlandı).',
  'Birini ata, öncelik, başlangıç ve bitiş tarihi ver, etiket ekle.',
  'Açıklama yaz, kontrol listesi ekle, dosya yükle, yorum yaz (@ ile arkadaşını etiketle).',
  'Başka bir göreve “bloklar” ya da “ilişkili” bağlantısı ver.',
  '“Tekrar” alanından görevi günlük/haftalık/aylık tekrarlat (önce bitiş tarihi ver). Görevi tamamlayınca bir sonraki otomatik oluşur.',
  '“Hatırlatıcı” alanına tarih ve saat seçip not yaz; zamanı gelince bildirim ve e-posta alırsın.',
])
  c.push(bullet(t));

c.push(h1('4. Görünümler'));
c.push(p('Görev listesinin üstündeki seçeneklerden aynı işleri farklı biçimlerde görebilirsin:'));
for (const t of [
  'Liste ve Tablo: satır satır; sütunları seçip filtreleyebilir, sıralayabilirsin.',
  'Pano: sütunlarda sürükle-bırak ile durumu değiştir.',
  'Takvim: bitiş tarihlerine göre aylık görünüm.',
  '“Görünümler” menüsünden geçerli filtreni kaydedip ekiple paylaşabilirsin.',
])
  c.push(bullet(t));

c.push(h1('5. Scrum akışı'));
c.push(p('Space’i “Scrum” modunda oluşturduysan:'));
c.push(
  ...steps([
    'Space altında “Backlog ve sprint’ler”e gir. Görevleri önem sırasına sürükle.',
    'Bir sprint oluştur (ad ve tarihler ver) ve backlog’dan işleri sprint’e ekle. Task’lara Story Point ver.',
    'Sprint’i başlat. “Sprint panosu”nda işleri sütunlar arasında sürükleyerek ilerlet.',
    'Sprint bitince “Tamamla” de. Yarım kalan işleri bir sonraki sprint’e devretmeyi seçebilirsin.',
    'Sprint özetini (review) ve retrospektifi aç; retrospektifte “iyi giden / geliştirilecek / aksiyon” maddeleri yazıp aksiyonu göreve çevirebilirsin.',
    '“Panel” sayfasında burndown, velocity gibi grafikleri gör.',
  ]),
);
c.push(h2('Sprint’leri yönetme'));
for (const t of [
  'Sol menüde “Backlog ve sprint’ler” satırının okuna basınca Space’in tüm sprint’leri altında listelenir; birine tıklarsan o sprint’in panosu açılır.',
  'Backlog sayfasında bir işi tutamacından sürükleyip Backlog, sprint’ler ya da başka bir sprint üstüne bırakabilirsin. Satırdaki “⋯” menüsünden de taşıyabilirsin.',
  'Bir işi başka bir işin üstüne sağa doğru kaydırarak bırakırsan o işin alt işi olur. Task başka Task’ın altına girerse Sub-task’a dönüşür; üstteki işin tipi değişmez.',
  '“Listeyi kopyala” sprint ya da Backlog listesini panoya alır; Excel’e yapıştırınca sütunlara ayrılır.',
  '“Excel” menüsü ve sprint’in “⋯” menüsü: sprint’i (işler, atanan, öncelik, puan, tarihler, alt işler, bağımlılıklar) Excel’e aktar; aynı dosyayı “Excel’den içe aktar” ile geri al. İçe aktarmadan önce dosya kontrol edilir. Numarası (ID) bu Space’te olan işler güncellenir, olmayanlar yeni açılır.',
  'Sprint’in “⋯” menüsünden “Sprint yedeğini indir (ZIP)”; Backlog sayfasındaki “Excel” menüsünden “Yedekten sprint yükle…”. Yorumlar, checklist’ler ve ek dosyalar da yedeğe girer.',
  'Bir işin numarasına (ör. MOB-12) tıklarsan o işin bağlantısı kopyalanır. Bu bağlantı işi doğrudan açar.',
])
  c.push(bullet(t));

c.push(h1('6. Planlama: Gantt, iş yükü, zaman'));
for (const t of [
  'Gantt: Space altında “Gantt”ı aç. İşlere tarih verdiysen çubuk olarak görünür. Çubuğu sürükleyerek tarihi kaydır; bağlı işler de otomatik kayar (üstteki kutuyla kapatabilirsin). Oklar “bu bitmeden başlamaz” bağlantılarını, kırmızı çerçeve kritik yolu gösterir.',
  'İş yükü: kimin ne kadar yüklü olduğunu gösterir.',
  'Zaman çizelgesi: göreve zamanlayıcı başlatıp ya da elle süre girip haftalık toplamı gör.',
])
  c.push(bullet(t));

c.push(h1('7. Dokümanlar'));
c.push(
  ...steps([
    'Space altında “Dokümanlar”a gir ve “Yeni sayfa”ya bas.',
    'Başlığı yaz, içeriği yaz: başlıklar, liste, tablo, kod bloğu ve onay kutulu görev listesi ekleyebilirsin. Yazdıkların kendiliğinden kaydedilir (“Kaydedildi” yazısını göreceksin).',
    'Sayfanın altında “Dosya ekle” ile dosya yükle; “Bağlı görevler”den bir göreve bağla.',
    '“Sürümler” ile eski hâllere bak, güncelle farkını gör ve istersen geri yükle.',
    'Araç çubuğundaki görsel düğmesiyle ya da panodan yapıştırarak / sürükleyerek sayfaya resim ekle. Geri al / Yinele düğmeleri (Ctrl+Z, Ctrl+Shift+Z) yazdıklarını geri getirir.',
    '“Word olarak indir”, “Markdown indir” ya da “Yazdır / PDF” ile dışarı al.',
    'Sol taraftaki sayfa ağacında sürükleyerek alt sayfa oluşturabilirsin. Sildiklerin çöp kutusunda 30 gün bekler.',
  ]),
);

c.push(h1('8. Ekip yönetimi ve iletişim'));
c.push(h2('Hesap açma ve davet'));
c.push(
  ...steps([
    'Ayarlar → Üyeler sayfasına git (Sahip ve Yönetici görür).',
    '“Hesap oluştur”: ad, e-posta ve rol gir; şifreyi boş bırakırsan uygulama güvenli bir geçici şifre üretir. Şifreyi ekranda bir kez görürsün; kişiye ilet.',
    'Alternatif olarak e-postayla davet gönderebilirsin; kişi bağlantıdan kendi şifresini belirler.',
  ]),
);
c.push(
  note(
    'Roller:',
    'Sahip ve Yönetici her şeyi yönetir; Üye çalışır; Misafir yalnızca kendisine açılan Space’leri görür.',
  ),
);
c.push(gap());
c.push(h2('Ekipler'));
c.push(
  ...steps([
    'Ayarlar → Ekipler → “Ekip ekle”. Ad ver, üyeleri seç.',
    'Bir görevde “Atananları değiştir” menüsünde ekibin adına tıkla; tüm üyeleri göreve atanır.',
  ]),
);
c.push(gap());
c.push(h2('Mesajlaşma ve bildirim'));
for (const t of [
  'Mesajlar → “Yeni mesaj” → kişiyi seç → yaz, Enter ile gönder. Yeni mesaj gelince menüde sayı rozeti çıkar.',
  'Ayarlar → Bildirimler’den hangi olayda uygulama içi bildirim, hangisinde e-posta alacağını seç.',
])
  c.push(bullet(t));

c.push(h1('9. Hedefler, formlar, otomasyon'));
for (const t of [
  'Hedefler → “Hedef ekle”. “Görev bazlı” hedefe görevleri bağlarsın, görevler bitince çubuk dolar. “Sayısal” hedefte başlangıç ve hedef sayıyı girip “Güncel değer”i elle güncellersin.',
  'Formlar: Space ayarlarında “Form ekle”. Hedef listeyi, açılacak görev türünü ve hangi alanların sorulacağını seç. Üyeler (görüntüleyiciler dahil) Space altında “Formlar”dan doldurur; sonuç hedef listede görev olarak açılır.',
  'Otomasyon: Space ayarlarında “Otomasyon ekle”. Örnek: “durum Tamamlandı olunca bana bildirim gönder”.',
  'Entegrasyonlar: Ayarlar → Entegrasyonlar’dan webhook ve kod deposu bağlantıları, Ayarlar → API’den erişim anahtarı oluşturulur.',
])
  c.push(bullet(t));

c.push(h1('10. Hızlı deneme senaryosu (15–20 dakika)'));
c.push(p('Sırayla şunları yaparsan uygulamanın ana özelliklerini görmüş olursun:'));
c.push(
  ...steps([
    '“Deneme” adında bir Scrum Space oluştur.',
    '“Görevler” listesine 5 görev ekle; birine bitiş tarihi ve bir arkadaşını ata.',
    'Bir göreve haftalık tekrar ver ve “Tamamlandı” yap; yeni örneğin oluştuğunu gör.',
    'Backlog’da bir sprint oluştur, 3 işi ekle, başlat, panoda sürükleyip tamamla.',
    'Gantt’a gir; iki görev arasında “bloklar” bağlantısı verip çubuğu sürükle, bağlı işin kaydığını gör.',
    'Dokümanlar’da bir sayfa yaz, dosya ekle, Markdown olarak indir.',
    'Ayarlar → Üyeler’den ikinci bir hesap aç, o hesapla başka bir tarayıcıda giriş yapıp Mesajlar’dan yazış.',
    'Bir Hedef oluştur, görevlerini bağla; bir Form kurup doldur.',
  ]),
);

c.push(h1('11. Sık karşılaşılan durumlar'));
const faq = [
  [
    'Sayfa açılmıyor / 502',
    'Sunucu henüz açılıyordur; 30 saniye bekleyip yenile. Olmazsa veritabanı hizmetinin çalıştığını ve “pnpm dev” penceresinin açık olduğunu kontrol et.',
  ],
  [
    'E-posta gelmiyor',
    'Önce spam klasörüne bak ve “Spam değil” de. Sunucuda gönderen adresin (SMTP) ayarlı olması gerekir.',
  ],
  [
    'Bir şeyi göremiyorum',
    'Rolün yetmiyor olabilir ya da Space “Özel”dir ve sen üyesi değilsindir. Yöneticiden iste.',
  ],
  ['Şifremi unuttum', 'Giriş ekranından “Şifremi unuttum” de; ya da bir Yönetici yeni hesap açar.'],
  [
    'Görevi yanlış sildim',
    'Ayarlar → Arşiv sayfasındaki çöp kutusundan 30 gün içinde geri getirebilirsin.',
  ],
  [
    'Kimin ne yaptığını görmek istiyorum',
    'Sahip ve Yöneticiler Ayarlar → Denetim günlüğü sayfasını açar. Kişiye, türe ve tarihe göre süzer, CSV olarak indirir.',
  ],
  [
    'Bir Space’i yedeklemek / geri yüklemek',
    'Yedek: Space ayarları → Yedek → ZIP indir. Geri yükleme: Ayarlar → Genel → “Yedekten Space yükle” (yeni anahtar verirsin; mevcut hiçbir şeyin üzerine yazılmaz).',
  ],
  ['Koyu tema / İngilizce', 'Sağ üstteki yuvarlak simgeden Tema ve Dil menülerini kullan.'],
];
const colW = [2600, W - 2600];
const border = { style: BorderStyle.SINGLE, size: 4, color: 'D4D4D8' };
const cellB = { top: border, bottom: border, left: border, right: border };
c.push(
  new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: colW,
    rows: [
      new TableRow({
        tableHeader: true,
        children: ['Durum', 'Ne yapmalı'].map(
          (t, i) =>
            new TableCell({
              width: { size: colW[i], type: WidthType.DXA },
              borders: cellB,
              shading: { type: ShadingType.CLEAR, fill: 'EEF2FF', color: 'auto' },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: t, bold: true, size: 21, color: BRAND })],
                }),
              ],
            }),
        ),
      }),
      ...faq.map(
        ([a, b]) =>
          new TableRow({
            cantSplit: true,
            children: [a, b].map(
              (t, i) =>
                new TableCell({
                  width: { size: colW[i], type: WidthType.DXA },
                  borders: cellB,
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: t, size: 21, bold: i === 0 })],
                    }),
                  ],
                }),
            ),
          }),
      ),
    ],
  }),
);

const doc = new Document({
  creator: 'Egebis Seyir',
  title: 'Egebis Seyir - Kullanım Kılavuzu',
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
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: 'Calibri', size: 24, bold: true },
        paragraph: { outlineLevel: 1 },
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
      ...stepsConfigs,
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
      children: c,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(process.argv[2], buf);
  console.log('ok', buf.length);
});

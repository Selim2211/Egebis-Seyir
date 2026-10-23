/**
 * Çağrı sistemi yanıt şablonları (ADR-140). Metinler ayarlardan düzenlenir; `{anahtar}` yer tutucuları firma,
 * kayıt ve şirket bilgisiyle doldurulur. Hem API (gönderim) hem arayüz (önizleme) bu dosyayı kullanır.
 */
export const TICKET_TEMPLATE_KEYS = ['ack', 'processing', 'resolved'] as const;
export type TicketTemplateKey = (typeof TICKET_TEMPLATE_KEYS)[number];

/** Şablonlarda kullanılabilen yer tutucular (arayüzde listelenir). */
export const TICKET_PLACEHOLDERS = [
  'ad',
  'firma',
  'kayitNo',
  'konu',
  'proje',
  'atanan',
  'sirketAdi',
  'telefon',
  'web',
  'imza',
] as const;
export type TicketPlaceholder = (typeof TICKET_PLACEHOLDERS)[number];

export interface TicketTemplate {
  enabled: boolean;
  subject: string;
  body: string;
}

const SIGN = '{imza}';

export const DEFAULT_TICKET_TEMPLATES: Record<TicketTemplateKey, TicketTemplate> = {
  ack: {
    enabled: true,
    subject: 'Re: {konu}',
    body:
      'Merhaba {ad},\n\n' +
      'E-postanız alındı ve {kayitNo} numarasıyla kaydedildi. Ekibimiz en kısa sürede inceleyecek.\n' +
      'Eklemek istedikleriniz olursa bu e-postayı yanıtlamanız yeterli; yanıtınız aynı kayda eklenir.\n\n' +
      SIGN,
  },
  processing: {
    enabled: true,
    subject: 'Re: {konu}',
    body:
      'Merhaba {ad},\n\n' +
      '{kayitNo} numaralı talebiniz ön değerlendirmeden geçti ve işleme alındı. ' +
      'Konuyla ilgili ekip arkadaşımız ({atanan}) çalışmaya başladı; gelişmeleri bu e-posta üzerinden paylaşacağız.\n\n' +
      SIGN,
  },
  resolved: {
    enabled: true,
    subject: 'Re: {konu}',
    body:
      'Merhaba {ad},\n\n' +
      '{kayitNo} numaralı talebiniz çözüldü. Sorunun devam ettiğini görürseniz bu e-postayı yanıtlamanız yeterli; ' +
      'talebi yeniden açarız.\n\n' +
      SIGN,
  },
};

/** `{anahtar}` yer tutucularını değerlerle doldurur; bilinmeyen ya da boş değerler boş metin olur. */
export function renderTicketTemplate(
  text: string,
  values: Partial<Record<TicketPlaceholder, string>>,
): string {
  return text
    .replace(/\{(\w+)\}/g, (match, key: string) => {
      if (!(TICKET_PLACEHOLDERS as readonly string[]).includes(key)) return match;
      return values[key as TicketPlaceholder] ?? '';
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

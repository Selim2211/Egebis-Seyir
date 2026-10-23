import { isValidRichText } from '@scrum/shared';
import { describe, expect, it } from 'vitest';
import {
  htmlToText,
  isAutomatedMail,
  stripQuotedReply,
  textToRichText,
  ticketTitle,
} from './ticket-mail';

describe('ticketTitle', () => {
  it('Re:/Fwd:/Ynt: önekleri atılır, boşluklar sadeleşir', () => {
    expect(ticketTitle('Re: RE: Fwd:  Giriş   yapılamıyor ')).toBe('Giriş yapılamıyor');
    expect(ticketTitle('Ynt: Sepet hatası')).toBe('Sepet hatası');
  });
  it('boş konuya yer tutucu verilir, uzun konu 200 karaktere kısalır', () => {
    expect(ticketTitle('   ')).toBe('(Konusuz e-posta)');
    expect(ticketTitle(undefined)).toBe('(Konusuz e-posta)');
    expect(ticketTitle('x'.repeat(300))).toHaveLength(200);
  });
});

describe('isAutomatedMail', () => {
  const base = { fromEmail: 'musteri@firma.com', ownAddress: 'destek@egebis.com.tr' };
  it('normal müşteri e-postası otomatik değildir', () => {
    expect(isAutomatedMail({ ...base, headers: new Map() })).toBe(false);
    expect(isAutomatedMail({ ...base, headers: new Map([['auto-submitted', 'no']]) })).toBe(false);
  });
  it('geri dönen posta, otomatik yanıt ve toplu gönderim otomatiktir', () => {
    expect(isAutomatedMail({ ...base, fromEmail: 'mailer-daemon@x.com', headers: new Map() })).toBe(
      true,
    );
    expect(isAutomatedMail({ ...base, fromEmail: 'noreply@x.com', headers: new Map() })).toBe(true);
    expect(
      isAutomatedMail({ ...base, headers: new Map([['auto-submitted', 'auto-replied']]) }),
    ).toBe(true);
    expect(isAutomatedMail({ ...base, headers: new Map([['precedence', 'bulk']]) })).toBe(true);
    expect(isAutomatedMail({ ...base, headers: new Map([['list-id', '<a.b>']]) })).toBe(true);
  });
});

describe('textToRichText', () => {
  it('paragraflara ve satır sonlarına böler; sonuç geçerli zengin metindir', () => {
    const doc = textToRichText('Merhaba,\nsepet açılmıyor.\r\n\nTeşekkürler');
    expect(doc.content).toHaveLength(2);
    expect(doc.content?.[0]?.content?.map((n) => n.type)).toEqual(['text', 'hardBreak', 'text']);
    expect(isValidRichText(doc)).toBe(true);
  });
  it('boş metin boş paragraf olur', () => {
    expect(isValidRichText(textToRichText('  \n '))).toBe(true);
  });
  it('çok uzun metin kırpılır ve hâlâ geçerlidir', () => {
    const doc = textToRichText('a'.repeat(50_000));
    expect(JSON.stringify(doc).length).toBeLessThan(30_000);
    expect(isValidRichText(doc)).toBe(true);
  });
});

describe('htmlToText / stripQuotedReply', () => {
  it('HTML etiketlerini ve stil bloklarını temizler', () => {
    expect(htmlToText('<style>p{}</style><p>Merhaba&nbsp;dünya</p><p>İki</p>')).toBe(
      'Merhaba dünya\n\nİki',
    );
  });
  it('alıntılanan eski yazışmayı keser', () => {
    const reply =
      'Sorun çözüldü, sağ olun.\n\n23.10.2026 tarihinde Egebis yazdı:\n> Talebiniz alındı';
    expect(stripQuotedReply(reply)).toBe('Sorun çözüldü, sağ olun.');
    expect(stripQuotedReply('> sadece alıntı')).toBe('> sadece alıntı');
  });
});

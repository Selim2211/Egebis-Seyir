import { describe, expect, it } from 'vitest';
import {
  checkAvatar,
  checkUpload,
  isPreviewable,
  MAX_AVATAR_BYTES,
  mimeFromFileName,
  safeDownloadName,
  sniffMime,
} from './attachments';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const PDF = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const TEXT = new TextEncoder().encode('merhaba');
const MAX = 1000;

const upload = (fileName: string, header: Uint8Array, size = 100) =>
  checkUpload({ fileName, size, maxBytes: MAX, header });

describe('içerik imzası', () => {
  it('resim ve PDF türlerini tanır', () => {
    expect(sniffMime(PNG)).toBe('image/png');
    expect(sniffMime(JPEG)).toBe('image/jpeg');
    expect(sniffMime(PDF)).toBe('application/pdf');
    expect(sniffMime(WEBP)).toBe('image/webp');
    expect(sniffMime(TEXT)).toBeNull();
    expect(sniffMime(new Uint8Array())).toBeNull();
  });
});

describe('yükleme doğrulaması (ADR-056)', () => {
  it('uzantıdan MIME türü türetir', () => {
    expect(mimeFromFileName('Rapor.PDF')).toBe('application/pdf');
    expect(mimeFromFileName('veri.bilinmeyen')).toBe('application/octet-stream');
    expect(mimeFromFileName('uzantisiz')).toBe('application/octet-stream');
  });

  it('geçerli dosyaları kabul eder', () => {
    expect(upload('foto.png', PNG)).toEqual({ ok: true, mime: 'image/png' });
    expect(upload('not.txt', TEXT)).toEqual({ ok: true, mime: 'text/plain' });
    expect(upload('arsiv.zip', TEXT)).toEqual({ ok: true, mime: 'application/zip' });
  });

  it('çalıştırılabilir ve komut dosyalarını reddeder (büyük/küçük harf duyarsız)', () => {
    for (const name of ['kurulum.exe', 'a.BAT', 'x.ps1', 'araç.sh', 'çift.pdf.exe']) {
      expect(upload(name, TEXT)).toEqual({ ok: false, code: 'ATTACHMENT_TYPE_BLOCKED' });
    }
  });

  it('uzantısı resim/PDF olup içeriği başka olan dosyayı reddeder', () => {
    expect(upload('sahte.png', TEXT)).toEqual({ ok: false, code: 'ATTACHMENT_INVALID' });
    expect(upload('sahte.pdf', PNG)).toEqual({ ok: false, code: 'ATTACHMENT_INVALID' });
    expect(upload('gercek.jpg', JPEG).ok).toBe(true);
  });

  it('boyut ve ad sınırları', () => {
    expect(upload('buyuk.zip', TEXT, MAX + 1)).toEqual({ ok: false, code: 'ATTACHMENT_TOO_LARGE' });
    expect(upload('bos.txt', TEXT, 0)).toEqual({ ok: false, code: 'ATTACHMENT_INVALID' });
    expect(upload('', TEXT)).toEqual({ ok: false, code: 'ATTACHMENT_INVALID' });
    expect(upload(`${'a'.repeat(300)}.txt`, TEXT)).toEqual({
      ok: false,
      code: 'ATTACHMENT_INVALID',
    });
  });

  it('önizleme yalnızca güvenli türlerde (SVG ve HTML yok)', () => {
    expect(isPreviewable('image/png')).toBe(true);
    expect(isPreviewable('application/pdf')).toBe(true);
    expect(isPreviewable('image/svg+xml')).toBe(false);
    expect(isPreviewable('text/html')).toBe(false);
  });

  it('indirme adından yol ve denetim karakterleri atılır', () => {
    expect(safeDownloadName('../../etc/passwd')).toBe('.._.._etc_passwd');
    expect(safeDownloadName('a"b\nc.txt')).toBe('a_b_c.txt');
    expect(safeDownloadName('')).toBe('dosya');
  });
});

describe('profil fotoğrafı (ADR-059)', () => {
  it('PNG/JPEG/WebP kabul; PDF, metin ve fazla büyük reddedilir', () => {
    expect(checkAvatar(PNG)).toEqual({ ok: true, mime: 'image/png' });
    expect(checkAvatar(JPEG).ok).toBe(true);
    expect(checkAvatar(WEBP).ok).toBe(true);
    expect(checkAvatar(PDF).ok).toBe(false);
    expect(checkAvatar(TEXT).ok).toBe(false);
    const big = new Uint8Array(MAX_AVATAR_BYTES + 1);
    big.set(PNG);
    expect(checkAvatar(big).ok).toBe(false);
  });
});

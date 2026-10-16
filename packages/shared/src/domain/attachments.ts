import { ERROR_CODES } from '../errors/codes';

/** Dosya ekleri (ADR-056). */
export const MAX_UPLOAD_MB_DEFAULT = 100;
export const MAX_ATTACHMENTS_PER_ITEM = 50;
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** Uzantıdan türetilen MIME türleri; listede olmayan uzantı `application/octet-stream` olur. */
const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  xml: 'application/xml',
  html: 'text/html',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  mp4: 'video/mp4',
  mp3: 'audio/mpeg',
};

/** Satır içi önizlemesi güvenli olan türler; SVG ve HTML bilerek dışarıda. */
export const PREVIEWABLE_MIMES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
] as const;

export const extensionOf = (fileName: string): string => {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? '' : fileName.slice(dot + 1).toLowerCase();
};

export const mimeFromFileName = (fileName: string): string =>
  MIME_BY_EXTENSION[extensionOf(fileName)] ?? 'application/octet-stream';

export const isPreviewable = (mime: string): boolean =>
  (PREVIEWABLE_MIMES as readonly string[]).includes(mime);

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((byte, i) => bytes[offset + i] === byte);

/** İçerik imzasından resim/PDF türü; tanınmazsa null. */
export function sniffMime(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'application/pdf';
  return null;
}

export type UploadCheck =
  | {
      ok: true;
      mime: string;
      /** Uzantı resim/PDF diyor ama içerik başka; dosya kabul edilir, önizlenmez (ADR-114). */
      mismatch: boolean;
    }
  | {
      ok: false;
      code: typeof ERROR_CODES.ATTACHMENT_TOO_LARGE | typeof ERROR_CODES.ATTACHMENT_INVALID;
    };

/**
 * Yüklemeyi doğrular (ADR-056, ADR-114): yalnızca ad ve boyut. Her dosya türü kabul edilir;
 * tanınmayan türler `application/octet-stream` olarak saklanır ve hep indirilir, tarayıcıda açılmaz.
 * Uzantı resim/PDF olup içerik farklıysa reddedilmez; türü içerikten alınır (tanınmazsa octet-stream).
 * `header`: dosyanın ilk baytları.
 */
export function checkUpload(input: {
  fileName: string;
  size: number;
  maxBytes: number;
  header: Uint8Array;
}): UploadCheck {
  const { fileName, size, maxBytes, header } = input;
  if (fileName.trim() === '' || fileName.length > 255 || size <= 0) {
    return { ok: false, code: ERROR_CODES.ATTACHMENT_INVALID };
  }
  if (size > maxBytes) return { ok: false, code: ERROR_CODES.ATTACHMENT_TOO_LARGE };
  const byName = mimeFromFileName(fileName);
  if (isPreviewable(byName)) {
    const sniffed = sniffMime(header);
    if (sniffed !== byName) {
      return { ok: true, mime: sniffed ?? 'application/octet-stream', mismatch: true };
    }
  }
  return { ok: true, mime: byName, mismatch: false };
}

/** Profil fotoğrafı: yalnızca PNG/JPEG/WebP, en çok 2 MB (ADR-059). */
export function checkAvatar(bytes: Uint8Array): { ok: true; mime: string } | { ok: false } {
  const mime = sniffMime(bytes);
  const allowed = mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/webp';
  return allowed && bytes.length <= MAX_AVATAR_BYTES ? { ok: true, mime } : { ok: false };
}

/** İndirme adı: yol ayırıcılar ve denetim karakterleri atılır. */
export const safeDownloadName = (fileName: string): string =>
  // eslint-disable-next-line no-control-regex
  fileName.replace(/[\\/\u0000-\u001f"]/g, '_').slice(0, 255) || 'dosya';

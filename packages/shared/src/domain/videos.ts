/**
 * Video arşivi kuralları (Faz 15, ADR-129). Tarayıcıda oynatılabilen biçimler kabul edilir; tür dosya
 * adından türetilir ve tamamlanınca içerik imzasıyla doğrulanır.
 */

/** Varsayılan en büyük video (MB); sunucuda `MAX_VIDEO_MB` ile değişir. */
export const MAX_VIDEO_MB_DEFAULT = 2048;
/** Yükleme parça boyutu: ters vekil (nginx) gövde sınırına takılmayacak kadar küçük. */
export const VIDEO_CHUNK_BYTES = 8 * 1024 * 1024;
/** Sunucunun tek istekte kabul ettiği en büyük parça (istemci parçası + pay). */
export const VIDEO_CHUNK_MAX_BYTES = 16 * 1024 * 1024;
export const VIDEO_TITLE_MAX = 200;
export const VIDEO_FOLDER_NAME_MAX = 100;

const VIDEO_MIME_BY_EXTENSION: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

/** Kabul edilen uzantılar (dosya seçicinin `accept` değeri için). */
export const VIDEO_EXTENSIONS = Object.keys(VIDEO_MIME_BY_EXTENSION);

/** Dosya adından video türü; desteklenmiyorsa null. */
export function videoMimeOf(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.');
  const ext = dot < 0 ? '' : fileName.slice(dot + 1).toLowerCase();
  return VIDEO_MIME_BY_EXTENSION[ext] ?? null;
}

/**
 * İçerik imzası: MP4/MOV dosyalarında 4. bayttan itibaren `ftyp`, WebM'de EBML başlığı. Uzantısı video
 * olup içeriği başka bir şey olan dosya (ör. yeniden adlandırılmış HTML) kabul edilmez.
 */
export function looksLikeVideo(mime: string, head: Uint8Array): boolean {
  const at = (offset: number, bytes: number[]) => bytes.every((b, i) => head[offset + i] === b);
  if (mime === 'video/webm') return at(0, [0x1a, 0x45, 0xdf, 0xa3]);
  // 'ftyp' = 66 74 79 70
  return at(4, [0x66, 0x74, 0x79, 0x70]);
}

/** Bayt değerini okunur biçime çevirir (ör. 1,5 GB). */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

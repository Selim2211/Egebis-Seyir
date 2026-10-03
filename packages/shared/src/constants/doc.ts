/** Sayfa başlığı en çok bu kadar karakter. */
export const DOC_TITLE_MAX = 200;

/** Sayfa ağacı en çok bu kadar derin olabilir (kök = 1). */
export const DOC_MAX_DEPTH = 6;

/** Aynı yazarın ardışık kayıtları bu süre içinde tek sürümde birleşir (ADR-069). */
export const DOC_VERSION_WINDOW_MS = 10 * 60 * 1000;

/** Bir sayfanın saklanan sürüm sayısı üst sınırı; en eskiler silinir. */
export const DOC_MAX_VERSIONS = 100;

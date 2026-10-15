/**
 * Kullanıcı kılavuzunun içerik biçimi. Aynı JSON hem uygulama içi Yardım sayfasını hem de Word
 * kılavuzunu (scripts/docs/make-guide-docx.cjs) besler; metinde **kalın** işaretlenebilir.
 */
export type GuideBlock =
  | { type: 'p'; text: string }
  | { type: 'steps'; items: string[] }
  | { type: 'bullets'; items: string[] }
  | { type: 'tip' | 'warn' | 'note'; text: string }
  | { type: 'table'; head: string[]; rows: string[][] }
  | {
      type: 'figure';
      /** public/help/<dil>/<image>.png */
      image: string;
      alt: string;
      caption: string;
      /** Görseldeki numaralı işaretleyicilerin açıklaması: 1. madde = ① numaralı işaret. */
      legend: string[];
    };

export interface GuideSection {
  id: string;
  title: string;
  blocks: GuideBlock[];
}

export interface Guide {
  title: string;
  subtitle: string;
  sections: GuideSection[];
}

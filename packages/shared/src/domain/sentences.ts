/**
 * Açıklamadaki cümle sayısı (AI Story Point önerisi için asgari metin, ADR-155). Cümle; nokta,
 * soru, ünlem ya da üç nokta ile biten ve en az iki kelime içeren parçadır. Satır sonları ve
 * madde işaretli satırlar da cümle sınırı sayılır (listeler sık kullanıldığı için).
 */
export function countSentences(text: string): number {
  return text
    .split(/[.!?…]+(?=\s|$)|\n+/u)
    .map((part) => part.replace(/^[\s\-*•\d.)]+/u, '').trim())
    .filter((part) => part.split(/\s+/u).filter((w) => /\p{L}/u.test(w)).length >= 2).length;
}

/** AI tahmin ayarının sınırları. */
export const AI_ESTIMATE_MIN_SENTENCES = { min: 1, max: 50, default: 5 } as const;

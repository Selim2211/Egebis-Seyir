import type { PointerEvent, PointerEventHandler } from 'react';

/**
 * Bunların üstünde basılı tutmak sürükleme başlatmaz: tıklama hedefleridir. Başlık bağlantısı bilerek
 * dışarıda: satır başlığından da tutulup sürüklenebilir (ADR-123).
 */
const INTERACTIVE = 'button, input, select, textarea, label, [role="menuitem"], [role="checkbox"]';

/**
 * Satırın tamamı sürüklenebilirken içindeki düğme ve kutucuklar güvenle tıklanabilsin diye sürükleme
 * onların üstünden başlamaz (sürükleme tutamacı `data-drag-handle` hariç). Aksi halde tıklarken fare
 * birkaç piksel kayınca tıklama sürüklemeye dönüşüp kayboluyordu (Faz 15, ADR-133).
 */
export function dragFromRow(
  handler: PointerEventHandler | undefined,
): PointerEventHandler | undefined {
  if (!handler) return undefined;
  return (event: PointerEvent) => {
    const target = event.target as HTMLElement | null;
    const interactive = target?.closest(INTERACTIVE);
    if (interactive && !interactive.closest('[data-drag-handle]')) return;
    handler(event);
  };
}

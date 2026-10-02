import { useVirtualizer } from '@tanstack/react-virtual';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';

/** Bu satır sayısından sonra sanallaştırma devreye girer (ADR-052). */
export const VIRTUALIZE_AFTER = 100;

/**
 * Satır listesi: az satırda hepsi çizilir, çoksa yalnızca görünen aralık (brief §11 "büyük listelerde
 * akıcılık"). Kaydırma, en yakın `main` öğesindedir (uygulama kabuğunun içerik alanı).
 */
export function VirtualRows<T>({
  rows,
  estimate,
  getKey,
  render,
}: {
  rows: T[];
  estimate: number;
  getKey: (row: T) => string;
  render: (row: T) => ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const [margin, setMargin] = useState(0);
  const virtualized = rows.length > VIRTUALIZE_AFTER;

  useLayoutEffect(() => {
    const element = container.current?.closest('main') ?? null;
    setScroller(element);
    if (element && container.current) {
      setMargin(
        container.current.getBoundingClientRect().top -
          element.getBoundingClientRect().top +
          element.scrollTop,
      );
    }
  }, [virtualized]);

  // TanStack Virtual'ın döndürdüğü fonksiyonlar React Compiler ile önbelleğe alınamaz; bileşen yalnızca
  // bu listeyi çizer, bu yüzden derleyici bu bileşeni atlasa sorun olmaz.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtual = useVirtualizer({
    count: virtualized ? rows.length : 0,
    getScrollElement: () => scroller,
    estimateSize: () => estimate,
    overscan: 12,
    scrollMargin: margin,
    getItemKey: (index) => getKey(rows[index]!),
  });

  if (!virtualized) {
    return (
      <div ref={container}>
        {rows.map((row) => (
          <div key={getKey(row)}>{render(row)}</div>
        ))}
      </div>
    );
  }

  return (
    <div ref={container} style={{ height: virtual.getTotalSize(), position: 'relative' }}>
      {virtual.getVirtualItems().map((item) => (
        <div
          key={item.key}
          data-index={item.index}
          ref={virtual.measureElement}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${item.start - virtual.options.scrollMargin}px)`,
          }}
        >
          {render(rows[item.index]!)}
        </div>
      ))}
    </div>
  );
}

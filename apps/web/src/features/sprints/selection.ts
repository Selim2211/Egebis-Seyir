import { createContext, useContext, useSyncExternalStore } from 'react';

/**
 * Backlog seçimi için küçük dış depo. Seçim React durumunda tutulsaydı her kutucuk işaretlenişinde sayfa ve
 * yüzlerce satır yeniden çizilir, tıklama geç tepki verirdi. Her satır yalnızca kendi kutucuğunun değerine
 * abone olur; sayfa ise yalnızca toplu işlem çubuğu için seçim kümesine.
 */
export function createSelectionStore() {
  let ids: ReadonlySet<string> = new Set();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    get: (): ReadonlySet<string> => ids,
    toggle: (id: string, on: boolean) => {
      if (ids.has(id) === on) return;
      const next = new Set(ids);
      if (on) next.add(id);
      else next.delete(id);
      ids = next;
      emit();
    },
    clear: () => {
      if (ids.size === 0) return;
      ids = new Set();
      emit();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
export type SelectionStore = ReturnType<typeof createSelectionStore>;

export const SelectionContext = createContext<SelectionStore | null>(null);

/** Tüm seçim kümesi (toplu işlem çubuğu için). */
export const useSelectionSet = (store: SelectionStore) =>
  useSyncExternalStore(store.subscribe, store.get);

/** Tek öğenin seçili olup olmadığı: yalnızca o satır değiştiğinde yeniden çizilir. */
export function useIsSelected(id: string): boolean {
  const store = useContext(SelectionContext);
  return useSyncExternalStore(
    (listener) => store?.subscribe(listener) ?? (() => undefined),
    () => store?.get().has(id) ?? false,
  );
}

/** Seçilebilirlik yoksa (store yok) null. */
export const useSelectionStore = () => useContext(SelectionContext);

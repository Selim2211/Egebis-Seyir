import { createContext, type ReactNode, useContext, useMemo } from 'react';

/** Dış kaynak (Guest katmanı) kişilerin id'leri; avatar ve adlar turuncu gösterilir (ADR-152). */
const OutsourceContext = createContext<ReadonlySet<string>>(new Set());

export function OutsourceIdsProvider({
  ids,
  children,
}: {
  ids: readonly string[];
  children: ReactNode;
}) {
  const set = useMemo(() => new Set(ids), [ids]);
  return <OutsourceContext.Provider value={set}>{children}</OutsourceContext.Provider>;
}

export const useIsOutsource = (userId: string): boolean => useContext(OutsourceContext).has(userId);

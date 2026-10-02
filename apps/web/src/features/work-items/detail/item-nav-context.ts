import { createContext } from 'react';

/** Detay görünümünün (panel veya tam sayfa) başka bir öğeyi nasıl açacağı. */
export const ItemNavContext = createContext<((key: string) => void) | null>(null);

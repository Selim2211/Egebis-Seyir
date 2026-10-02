import { createContext, useContext } from 'react';
import type { FavoriteType } from '@scrum/shared';
import type { ContainerType } from './queries';

export type StructureDialog =
  | { kind: 'createSpace' }
  | { kind: 'createFolder'; spaceId: string }
  | { kind: 'createList'; spaceId: string; folderId: string | null }
  | { kind: 'rename'; type: 'FOLDER' | 'LIST'; id: string; name: string }
  | { kind: 'moveList'; spaceId: string; id: string; folderId: string | null; name: string }
  | { kind: 'delete'; type: ContainerType; id: string; name: string };

export interface StructureActions {
  /** Oluştur / yeniden adlandır / taşı / silme onayı pencerelerinden birini açar. */
  open: (dialog: StructureDialog) => void;
  /** Arşivler; bildirimde "Geri al" vardır (brief §11). */
  archive: (type: ContainerType, id: string, name: string) => void;
  unarchive: (type: ContainerType, id: string) => void;
  restore: (type: ContainerType, id: string) => void;
  setFavorite: (type: FavoriteType, id: string, favorite: boolean) => void;
}

export const StructureActionsContext = createContext<StructureActions | null>(null);

/** Space/Folder/List işlemleri (kenar çubuğu, sayfa başlıkları, arşiv sayfası). */
export function useStructureActions(): StructureActions {
  const actions = useContext(StructureActionsContext);
  if (!actions) throw new Error('StructureActionsProvider eksik');
  return actions;
}

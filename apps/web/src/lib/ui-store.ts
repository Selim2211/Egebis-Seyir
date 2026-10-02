import type { Locale, Theme } from '@scrum/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type { Locale as Language, Theme };

interface UiState {
  theme: Theme;
  language: Locale;
  /** Son seçilen workspace (birden fazla üyelik varsa). */
  workspaceId: string | null;
  /** Mobilde kenar çubuğu açık mı (kalıcı değil). */
  sidebarOpen: boolean;
  /** Kenar çubuğu ağacında açık Space/Folder'lar (cihaza özel). */
  expanded: Record<string, boolean>;
  /** Table görünümünde görünen sütunlar (cihaza özel). */
  tableColumns: string[] | null;
  setTheme: (theme: Theme) => void;
  setLanguage: (language: Locale) => void;
  setWorkspaceId: (id: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
  setExpanded: (id: string, open: boolean) => void;
  setTableColumns: (columns: string[] | null) => void;
}

/**
 * Cihaz üzerindeki arayüz tercihleri. Oturum açıkken kaynak kullanıcı kaydıdır (ADR-037);
 * burası girişten önce ve ilk boyamada kullanılır. Anahtar adı index.html'deki betikle aynı olmalı.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'system',
      language: 'tr',
      workspaceId: null,
      sidebarOpen: false,
      expanded: {},
      tableColumns: null,
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setWorkspaceId: (workspaceId) => set({ workspaceId }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setExpanded: (id, open) => set((s) => ({ expanded: { ...s.expanded, [id]: open } })),
      setTableColumns: (tableColumns) => set({ tableColumns }),
    }),
    {
      name: 'scrum-ui',
      partialize: ({ theme, language, workspaceId, expanded, tableColumns }) => ({
        theme,
        language,
        workspaceId,
        expanded,
        tableColumns,
      }),
    },
  ),
);

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme(theme: Theme): void {
  const dark = theme === 'dark' || (theme === 'system' && darkQuery.matches);
  document.documentElement.classList.toggle('dark', dark);
}

/** Tema değişikliklerini (ve sistem temasını) <html> sınıfına yansıtır. */
export function bindThemeToDocument(): void {
  applyTheme(useUiStore.getState().theme);
  useUiStore.subscribe((state, prev) => {
    if (state.theme !== prev.theme) applyTheme(state.theme);
  });
  darkQuery.addEventListener('change', () => applyTheme(useUiStore.getState().theme));
}

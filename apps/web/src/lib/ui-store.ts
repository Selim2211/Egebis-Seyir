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
  setTheme: (theme: Theme) => void;
  setLanguage: (language: Locale) => void;
  setWorkspaceId: (id: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
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
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setWorkspaceId: (workspaceId) => set({ workspaceId }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
    }),
    {
      name: 'scrum-ui',
      partialize: ({ theme, language, workspaceId }) => ({ theme, language, workspaceId }),
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

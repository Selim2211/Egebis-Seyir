import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';
export type Language = 'tr' | 'en';

interface UiState {
  theme: Theme;
  language: Language;
  /** Mobilde kenar çubuğu açık mı (kalıcı değil). */
  sidebarOpen: boolean;
  setTheme: (theme: Theme) => void;
  setLanguage: (language: Language) => void;
  setSidebarOpen: (open: boolean) => void;
}

/** Kişisel arayüz tercihleri. Anahtar adı index.html'deki tema betiğiyle aynı olmalı. */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'system',
      language: 'tr',
      sidebarOpen: false,
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
    }),
    {
      name: 'scrum-ui',
      partialize: ({ theme, language }) => ({ theme, language }),
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

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type tr from '@/locales/tr/common.json';
import { type Language, useUiStore } from './ui-store';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: { common: typeof tr };
  }
}

/**
 * Dil dosyaları ayrı parçalar halinde yüklenir: ilk açılışta yalnızca etkin dil iner,
 * diğeri kullanıcı dili değiştirince istenir (giriş paketinden ~65 KB çıkar).
 */
const LOADERS: Record<Language, () => Promise<{ default: typeof tr }>> = {
  tr: () => import('@/locales/tr/common.json'),
  en: () => import('@/locales/en/common.json'),
};

async function ensureLoaded(language: Language): Promise<void> {
  if (i18n.hasResourceBundle(language, 'common')) return;
  const bundle = await LOADERS[language]();
  i18n.addResourceBundle(language, 'common', bundle.default);
}

/** Arayüz dili (ADR-024): varsayılan Türkçe, İngilizce ikinci dil. Uygulama çizilmeden önce beklenir. */
export async function initI18n(): Promise<void> {
  const language = useUiStore.getState().language;

  await i18n.use(initReactI18next).init({
    resources: {},
    partialBundledLanguages: true,
    lng: language,
    // Her iki dil dosyası da tüm anahtarları içerir (tür denetimi); ayrı yedek dil gerekmez.
    fallbackLng: false,
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  });
  await ensureLoaded(language);
  await i18n.changeLanguage(language);
  document.documentElement.lang = language;

  useUiStore.subscribe((state, prev) => {
    if (state.language === prev.language) return;
    void ensureLoaded(state.language).then(async () => {
      await i18n.changeLanguage(state.language);
      document.documentElement.lang = state.language;
    });
  });
}

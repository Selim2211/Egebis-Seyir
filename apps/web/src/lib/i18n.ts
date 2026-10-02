import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/en/common.json';
import tr from '@/locales/tr/common.json';
import { useUiStore } from './ui-store';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: { common: typeof tr };
  }
}

/** Arayüz dili (ADR-024): varsayılan Türkçe, İngilizce ikinci dil. */
export function initI18n(): void {
  const language = useUiStore.getState().language;

  void i18n.use(initReactI18next).init({
    resources: { tr: { common: tr }, en: { common: en } },
    lng: language,
    fallbackLng: 'tr',
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  });
  document.documentElement.lang = language;

  useUiStore.subscribe((state, prev) => {
    if (state.language === prev.language) return;
    void i18n.changeLanguage(state.language);
    document.documentElement.lang = state.language;
  });
}

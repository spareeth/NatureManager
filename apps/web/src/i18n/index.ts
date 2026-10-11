import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ar from './locales/ar.json';

export const RTL_LANGUAGES = ['ar'];

export function directionFor(lng: string): 'rtl' | 'ltr' {
  return RTL_LANGUAGES.includes(lng.split('-')[0] ?? lng) ? 'rtl' : 'ltr';
}

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  document.documentElement.dir = directionFor(lng);
});

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;

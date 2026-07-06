import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enCommon from './locales/en/common.json';
import enAdmin from './locales/en/admin.json';
import enAuth from './locales/en/auth.json';
import itCommon from './locales/it/common.json';
import itAdmin from './locales/it/admin.json';
import itAuth from './locales/it/auth.json';

// ponytail: catalogs bundled statically — switch to lazy per-namespace loading when they grow past a few KB
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon, admin: enAdmin, auth: enAuth },
      it: { common: itCommon, admin: itAdmin, auth: itAuth },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'it'],
    defaultNS: 'common',
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'tc_lang',
      caches: ['localStorage'],
    },
  });

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

export default i18n;

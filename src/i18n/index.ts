import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { DEFAULT_LANGUAGE, isAppLanguage, LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES } from "./languages";
import en from "./locales/en.json";
import enDocs from "./locales/docs/en.json";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en, docs: enDocs },
    },
    ns: ["translation", "docs"],
    defaultNS: "translation",
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: [],
      convertDetectedLanguage: (lng) => {
        const base = lng.split("-")[0];
        return isAppLanguage(base) ? base : DEFAULT_LANGUAGE;
      },
    },
  });

export default i18n;

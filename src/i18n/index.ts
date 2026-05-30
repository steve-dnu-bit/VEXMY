import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { DEFAULT_LANGUAGE, isAppLanguage, LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES } from "./languages";
import en from "./locales/en.json";
import de from "./locales/de.json";
import fr from "./locales/fr.json";
import ro from "./locales/ro.json";
import it from "./locales/it.json";
import es from "./locales/es.json";
import sv from "./locales/sv.json";
import no from "./locales/no.json";
import nl from "./locales/nl.json";
import uk from "./locales/uk.json";
import bg from "./locales/bg.json";

const resources = {
  en: { translation: en },
  de: { translation: de },
  fr: { translation: fr },
  ro: { translation: ro },
  it: { translation: it },
  es: { translation: es },
  sv: { translation: sv },
  no: { translation: no },
  nl: { translation: nl },
  uk: { translation: uk },
  bg: { translation: bg },
};

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ["localStorage"],
      convertDetectedLanguage: (lng) => {
        const base = lng.split("-")[0];
        return isAppLanguage(base) ? base : DEFAULT_LANGUAGE;
      },
    },
  });

export default i18n;

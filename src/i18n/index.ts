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
import bg from "./locales/bg.json";
import enDocs from "./locales/docs/en.json";
import deDocs from "./locales/docs/de.json";
import frDocs from "./locales/docs/fr.json";
import roDocs from "./locales/docs/ro.json";
import itDocs from "./locales/docs/it.json";
import esDocs from "./locales/docs/es.json";
import svDocs from "./locales/docs/sv.json";
import noDocs from "./locales/docs/no.json";
import nlDocs from "./locales/docs/nl.json";
import bgDocs from "./locales/docs/bg.json";

const resources = {
  en: { translation: en, docs: enDocs },
  de: { translation: de, docs: deDocs },
  fr: { translation: fr, docs: frDocs },
  ro: { translation: ro, docs: roDocs },
  it: { translation: it, docs: itDocs },
  es: { translation: es, docs: esDocs },
  sv: { translation: sv, docs: svDocs },
  no: { translation: no, docs: noDocs },
  nl: { translation: nl, docs: nlDocs },
  bg: { translation: bg, docs: bgDocs },
};

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    ns: ["translation", "docs"],
    defaultNS: "translation",
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

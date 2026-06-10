import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { translate } from "@vitalets/google-translate-api";

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, "../src/i18n/locales");

const TARGETS = {
  de: "de",
  fr: "fr",
  ro: "ro",
  it: "it",
  es: "es",
  sv: "sv",
  no: "no",
  nl: "nl",
  bg: "bg",
};

const BRANDS = [
  ["__Velbok__", "Velbok"],
  ["__STRIPE__", "Stripe"],
  ["__SUPABASE__", "Supabase"],
  ["__GOOGLE_AUTH__", "Google Authenticator"],
  ["__AUTHY__", "Authy"],
];

const KEEP_AS_EN = new Set([
  "Paris",
  "London",
  "Tokyo",
  "Rome",
  "Berlin",
  "Madrid",
  "Admin",
  "CSV",
  "JSON",
  "SMS",
  "VIP",
  "Laser",
  "Chat",
  "Stripe",
  "Velbok",
  "Supabase",
  "SLA",
  "PMU",
  "PDF",
  "HTML",
  "URL",
  "JPG",
  "PNG",
  "WebP",
  "SMTP",
  "SSL",
  "Resend",
  "GBP",
]);

function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

function setByPath(obj, dotPath, value) {
  const parts = dotPath.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] ??= {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function protectBrands(text) {
  let out = text;
  for (const [token, brand] of BRANDS) out = out.split(brand).join(token);
  return out;
}

function restoreBrands(text) {
  let out = text;
  for (const [token, brand] of BRANDS) out = out.split(token).join(brand);
  return out;
}

function protectInterpolation(text) {
  const tokens = [];
  const protectedText = text.replace(/\{\{[^}]+\}\}/g, (m) => {
    const token = `__I${tokens.length}__`;
    tokens.push(m);
    return token;
  });
  return { protectedText, tokens };
}

function restoreInterpolation(text, tokens) {
  let out = text;
  tokens.forEach((orig, i) => {
    out = out.split(`__I${i}__`).join(orig);
  });
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function translateText(text, langCode) {
  if (!text || typeof text !== "string") return text;
  if (KEEP_AS_EN.has(text.trim())) return text;

  const { protectedText, tokens } = protectInterpolation(protectBrands(text));
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await sleep(2500 + attempt * 1000);
      const { text: result } = await translate(protectedText, { from: "en", to: TARGETS[langCode] });
      return restoreInterpolation(restoreBrands(result), tokens);
    } catch (e) {
      if (attempt === 3) {
        console.warn(`  FAIL [${langCode}]: ${text.slice(0, 50)} (${e.message})`);
        return text;
      }
    }
  }
  return text;
}

async function main() {
  const en = JSON.parse(readFileSync(join(localesDir, "en.json"), "utf8"));
  const enFlat = flatten(en);
  const cachePath = join(localesDir, "_missing-keys-cache.json");
  const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};

  const selected = process.argv.slice(2);
  const langs = selected.length ? selected : Object.keys(TARGETS);
  const retranslate = process.argv.includes("--retranslate");

  for (const lang of langs) {
    if (!TARGETS[lang]) {
      console.warn("Skip unknown locale:", lang);
      continue;
    }

    const localePath = join(localesDir, `${lang}.json`);
    const locale = JSON.parse(readFileSync(localePath, "utf8"));
    const locFlat = flatten(locale);

    const todo = Object.keys(enFlat).filter((k) => {
      if (!(k in locFlat)) return true;
      if (retranslate && locFlat[k] === enFlat[k]) return true;
      return false;
    });

    if (!todo.length) {
      console.log(`${lang}: nothing to translate`);
      continue;
    }

    console.log(`${lang}: translating ${todo.length} keys...`);
    let translated = 0;

    for (let i = 0; i < todo.length; i++) {
      const key = todo[i];
      const enVal = enFlat[key];
      const cacheKey = `${lang}::${enVal}`;
      let val = cache[cacheKey];

      if (!val || val === enVal || retranslate) {
        val = await translateText(enVal, lang);
        cache[cacheKey] = val;
        if (val !== enVal) translated++;
        if ((i + 1) % 20 === 0) {
          writeFileSync(cachePath, JSON.stringify(cache, null, 2));
        }
      }

      setByPath(locale, key, val);
    }

    writeFileSync(localePath, JSON.stringify(locale, null, 2) + "\n", "utf8");
    writeFileSync(cachePath, JSON.stringify(cache, null, 2));
    console.log(`${lang}: done (${translated} newly translated)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

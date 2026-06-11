import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { translate } from "@vitalets/google-translate-api";

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, "../src/i18n/locales");
const sourcePath = join(__dirname, "_patch-source-en.json");

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
];

const KEEP_AS_EN = new Set([
  "Stripe",
  "Velbok",
  "Admin",
  "CSV",
  "PDF",
  "GBP",
  "Starter",
  "Studio",
  "Enterprise",
]);

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

function isRateLimitError(err) {
  const msg = String(err?.message ?? err);
  return msg.includes("Too Many Requests") || msg.includes("429");
}

async function translateText(text, langCode) {
  if (!text || typeof text !== "string") return text;
  if (KEEP_AS_EN.has(text.trim())) return text;

  const { protectedText, tokens } = protectInterpolation(protectBrands(text));
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await sleep(6000 + attempt * 3000);
      const { text: result } = await translate(protectedText, { from: "en", to: TARGETS[langCode] });
      return restoreInterpolation(restoreBrands(result), tokens);
    } catch (e) {
      if (isRateLimitError(e)) {
        const waitMs = 60000 + attempt * 20000;
        console.warn(`  Rate limited, waiting ${Math.round(waitMs / 1000)}s…`);
        await sleep(waitMs);
        continue;
      }
      if (attempt === 9) {
        console.warn(`  FAIL: ${text.slice(0, 50)} (${e.message})`);
        return text;
      }
    }
  }
  return text;
}

async function main() {
  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  const keys = Object.keys(source);
  const selected = process.argv.slice(2).filter((a) => a !== "--force");
  const force = process.argv.includes("--force");
  const langs = selected.length ? selected : Object.keys(TARGETS);

  for (const lang of langs) {
    if (!TARGETS[lang]) {
      console.warn("Skip unknown locale:", lang);
      continue;
    }

    const localePath = join(localesDir, `${lang}.json`);
    const locale = JSON.parse(readFileSync(localePath, "utf8"));
    const todo = keys.filter((key) => force || locale[key.split(".").reduce((o, p, i, a) => {
      if (i === a.length - 1) return o?.[p];
      return o?.[p];
    }, locale)] === source[key] || !key.split(".").reduce((o, p) => o?.[p], locale));

    // simpler: translate if current value equals English source
    const todoKeys = keys.filter((key) => {
      const parts = key.split(".");
      let cur = locale;
      for (const p of parts) cur = cur?.[p];
      return force || cur === source[key] || cur === undefined;
    });

    console.log(`${lang}: translating ${todoKeys.length} priority keys…`);
    let translated = 0;

    for (let i = 0; i < todoKeys.length; i++) {
      const key = todoKeys[i];
      const enVal = source[key];
      const val = await translateText(enVal, lang);
      setByPath(locale, key, val);
      if (val !== enVal) translated++;
      if ((i + 1) % 3 === 0) {
        writeFileSync(localePath, JSON.stringify(locale, null, 2) + "\n", "utf8");
      }
    }

    writeFileSync(localePath, JSON.stringify(locale, null, 2) + "\n", "utf8");
    console.log(`${lang}: done (${translated} translated)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

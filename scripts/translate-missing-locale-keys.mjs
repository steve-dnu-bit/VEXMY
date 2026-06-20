import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { translate } from "google-translate-api-x";

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, "../src/i18n/locales");
const BATCH_SIZE = 45;

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
  uk: "uk",
};

const BRANDS = [
  ["ZZZVELBOKZZZ", "Velbok"],
  ["ZZZSTRIPEZZZ", "Stripe"],
  ["ZZZSUPABASEZZZ", "Supabase"],
  ["ZZZGOOGLEAUTHZZZ", "Google Authenticator"],
  ["ZZZAUTHYZZZ", "Authy"],
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

function isRateLimitError(err) {
  const msg = String(err?.message ?? err);
  return msg.includes("Too Many Requests") || msg.includes("429") || msg.includes("503");
}

function prepareItem(enVal) {
  const { protectedText, tokens } = protectInterpolation(protectBrands(enVal));
  return { protectedText, tokens };
}

function finalizeItem(resultText, tokens) {
  return restoreInterpolation(restoreBrands(resultText), tokens);
}

async function translateBatch(items, langCode) {
  if (!items.length) return [];
  const texts = items.map((i) => i.protectedText);

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      if (attempt > 0) await sleep(3000 + attempt * 2000);
      const results = await translate(texts, {
        from: "en",
        to: TARGETS[langCode],
        forceBatch: true,
      });
      const arr = Array.isArray(results) ? results : [results];
      return arr.map((r, idx) => finalizeItem(r.text, items[idx].tokens));
    } catch (e) {
      if (isRateLimitError(e)) {
        const waitMs = 20000 + attempt * 10000;
        console.warn(`  Rate limited [${langCode}], waiting ${Math.round(waitMs / 1000)}s…`);
        await sleep(waitMs);
        continue;
      }
      if (attempt === 5) throw e;
    }
  }
  return items.map((i) => finalizeItem(i.protectedText, i.tokens));
}

async function main() {
  const en = JSON.parse(readFileSync(join(localesDir, "en.json"), "utf8"));
  const enFlat = flatten(en);
  const cachePath = join(localesDir, "_missing-keys-cache.json");
  const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};

  const retranslate = process.argv.includes("--retranslate");
  const selected = process.argv.slice(2).filter((a) => a !== "--retranslate");
  const langs = selected.length ? selected : Object.keys(TARGETS);

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
      const enVal = enFlat[k];
      const locVal = locFlat[k];
      if (retranslate && locVal === enVal) return true;
      if (!retranslate && locVal === enVal && !KEEP_AS_EN.has(String(enVal).trim())) return true;
      return false;
    });

    if (!todo.length) {
      console.log(`${lang}: nothing to translate`);
      continue;
    }

    console.log(`${lang}: translating ${todo.length} keys...`);
    let translated = 0;
    const pending = [];

    for (const key of todo) {
      const enVal = enFlat[key];
      if (!enVal || typeof enVal !== "string") {
        setByPath(locale, key, enVal);
        continue;
      }
      if (KEEP_AS_EN.has(enVal.trim())) {
        setByPath(locale, key, enVal);
        continue;
      }

      const cacheKey = `${lang}::${enVal}`;
      const cached = cache[cacheKey];
      if (cached && cached !== enVal && !retranslate) {
        setByPath(locale, key, cached);
        continue;
      }

      pending.push({ key, enVal, ...prepareItem(enVal) });
    }

    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const chunk = pending.slice(i, i + BATCH_SIZE);
      let results;
      try {
        results = await translateBatch(chunk, lang);
      } catch (e) {
        console.warn(`  Batch failed [${lang}], falling back per key: ${e.message}`);
        results = [];
        for (const item of chunk) {
          try {
            const single = await translateBatch([item], lang);
            results.push(single[0]);
          } catch {
            results.push(item.enVal);
          }
        }
      }

      chunk.forEach((item, idx) => {
        const val = results[idx] ?? item.enVal;
        cache[`${lang}::${item.enVal}`] = val;
        setByPath(locale, item.key, val);
        if (val !== item.enVal) translated++;
      });

      writeFileSync(localePath, JSON.stringify(locale, null, 2) + "\n", "utf8");
      writeFileSync(cachePath, JSON.stringify(cache, null, 2));
      console.log(`  ${lang}: ${Math.min(i + BATCH_SIZE, pending.length)}/${pending.length}`);
      await sleep(800);
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

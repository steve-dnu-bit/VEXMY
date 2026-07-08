import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { translate } from "google-translate-api-x";

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsDir = join(__dirname, "..", "src/i18n/locales/docs");

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

const MISSING_PAGE_SLUGS = ["pos-checkout", "pos-split-payments", "sms-twilio-setup"];

const BRANDS = [
  ["ZZZVELBOKZZZ", "Velbok"],
  ["ZZZSTRIPEZZZ", "Stripe"],
  ["ZZZWISEPADZZZ", "WisePad"],
  ["ZZZTWILIOZZZ", "Twilio"],
  ["ZZZSUPABASEZZZ", "Supabase"],
  ["ZZZNETLIFYZZZ", "Netlify"],
  ["ZZZHMRCZZZ", "HMRC"],
];

function protectBrands(text) {
  let out = text;
  for (const [token, brand] of BRANDS) out = out.split(brand).join(token);
  return out;
}

function restoreBrands(text) {
  let out = text;
  for (const [token, brand] of BRANDS) out = out.split(token).join(brand);
  // Google Translate sometimes mangles protection tokens (e.g. ZZZTWILIOZZZ → ZTwilio).
  out = out.replace(/Z{1,3}TwilioZ{0,3}/gi, "Twilio");
  out = out.replace(/Z{1,3}StripeZ{0,3}/gi, "Stripe");
  out = out.replace(/Z{1,3}VelbokZ{0,3}/gi, "Velbok");
  out = out.replace(/Z{1,3}WisePadZ{0,3}/gi, "WisePad");
  out = out.replace(/Z{1,3}SupabaseZ{0,3}/gi, "Supabase");
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

async function translateText(text, to) {
  if (!text || typeof text !== "string") return text;
  const { protectedText, tokens } = protectInterpolation(protectBrands(text));
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      if (attempt > 0) await sleep(2000 + attempt * 1500);
      const result = await translate(protectedText, { from: "en", to });
      return restoreInterpolation(restoreBrands(result.text), tokens);
    } catch (e) {
      const msg = String(e?.message ?? e);
      if (!msg.includes("Too Many Requests") && !msg.includes("429") && !msg.includes("503")) {
        if (attempt === 5) return text;
      } else {
        await sleep(15000 + attempt * 8000);
      }
    }
  }
  return text;
}

async function walk(value, to) {
  if (typeof value === "string") {
    await sleep(100);
    return translateText(value, to);
  }
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      out.push(await walk(item, to));
    }
    return out;
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = await walk(child, to);
    }
    return out;
  }
  return value;
}

function pageNeedsTranslation(enPage, locPage) {
  if (!locPage) return true;
  if (!locPage.sections || !Array.isArray(locPage.sections) || locPage.sections.length === 0) {
    return true;
  }
  const enSections = JSON.stringify(enPage.sections ?? []);
  const locSections = JSON.stringify(locPage.sections ?? []);
  return enSections === locSections;
}

async function main() {
  const en = JSON.parse(readFileSync(join(docsDir, "en.json"), "utf8"));
  const selected = process.argv.slice(2);
  const langs = selected.length ? selected : Object.keys(TARGETS);

  for (const lang of langs) {
    const googleCode = TARGETS[lang];
    if (!googleCode) {
      console.warn("Skip unknown locale:", lang);
      continue;
    }

    const localePath = join(docsDir, `${lang}.json`);
    const locale = JSON.parse(readFileSync(localePath, "utf8"));
    locale.pages ??= {};

    for (const slug of MISSING_PAGE_SLUGS) {
      const enPage = en.pages?.[slug];
      if (!enPage) {
        console.warn(`Missing English page: ${slug}`);
        continue;
      }

      const locPage = locale.pages[slug];
      if (!pageNeedsTranslation(enPage, locPage)) {
        console.log(`${lang}: ${slug} already translated`);
        continue;
      }

      console.log(`${lang}: translating docs page ${slug}...`);
      locale.pages[slug] = await walk(structuredClone(enPage), googleCode);
      writeFileSync(localePath, JSON.stringify(locale, null, 2) + "\n", "utf8");
      console.log(`${lang}: wrote ${slug}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

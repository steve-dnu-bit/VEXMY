import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { translate } from "@vitalets/google-translate-api";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(__dirname, "_patch-source-no-remaining.json");
const outPath = join(__dirname, "locale-no-remaining-patch.json");
const cachePath = join(__dirname, "../src/i18n/locales/_missing-keys-cache.json");

const BRANDS = [
  ["__VELBOK__", "Velbok"],
  ["__STRIPE__", "Stripe"],
  ["__SUPABASE__", "Supabase"],
];

const KEEP_AS_EN = new Set([
  "Admin", "CSV", "JSON", "SMS", "VIP", "Laser", "Chat", "Stripe", "Velbok",
  "Supabase", "SLA", "PMU", "PDF", "HTML", "URL", "JPG", "PNG", "WebP",
  "SMTP", "GBP", "Resend", "Inside Velbok", "Powered by Stripe",
]);

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

function polishNo(text) {
  return text
    .replace(/\.\.\./g, "…")
    .replace(/\bLoading…\b/g, "Laster…")
    .replace(/\bSaving…\b/g, "Lagrer…")
    .replace(/\bUploading…\b/g, "Laster opp…")
    .replace(/\bSearching…\b/g, "Søker…")
    .replace(/\bDeleting…\b/g, "Sletter…")
    .replace(/\bCreating…\b/g, "Oppretter…")
    .replace(/\bSending…\b/g, "Sender…")
    .replace(/\bDownloading…\b/g, "Laster ned…")
    .replace(/\bChecking…\b/g, "Sjekker…")
    .replace(/\bGenerating…\b/g, "Genererer…")
    .replace(/\bFinishing…\b/g, "Fullfører…")
    .replace(/\bRedirecting…\b/g, "Omdirigerer…")
    .replace(/\bUpdating…\b/g, "Oppdaterer…");
}

async function translateText(text, cache) {
  if (!text || typeof text !== "string") return text;
  if (KEEP_AS_EN.has(text.trim())) return text;

  const cacheKey = `no::${text}`;
  if (cache[cacheKey] && cache[cacheKey] !== text) {
    return polishNo(cache[cacheKey]);
  }

  const { protectedText, tokens } = protectInterpolation(protectBrands(text));

  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await sleep(1200 + attempt * 1500);
      const { text: result } = await translate(protectedText, { from: "en", to: "no" });
      const restored = polishNo(restoreInterpolation(restoreBrands(result), tokens));
      cache[cacheKey] = restored;
      return restored;
    } catch (e) {
      const msg = String(e?.message ?? e);
      if (msg.includes("Too Many Requests") || msg.includes("429")) {
        await sleep(30000 + attempt * 10000);
        continue;
      }
      if (attempt === 7) {
        console.warn(`  FAIL: ${text.slice(0, 60)} (${msg})`);
        return text;
      }
    }
  }
  return text;
}

async function main() {
  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};
  const keys = Object.keys(source);
  const no = {};

  console.log(`Translating ${keys.length} keys to Norwegian Bokmål…`);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    no[key] = await translateText(source[key], cache);
    if ((i + 1) % 25 === 0) {
      writeFileSync(cachePath, JSON.stringify(cache, null, 2));
      console.log(`  ${i + 1}/${keys.length}`);
    }
  }

  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  writeFileSync(outPath, JSON.stringify({ no }, null, 2) + "\n", "utf8");
  console.log(`Wrote ${keys.length} keys to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

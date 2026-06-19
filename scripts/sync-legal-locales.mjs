/**
 * Merge src/i18n/legal-translations/{lang}.json into src/i18n/locales/{lang}.json
 * Run: node scripts/sync-legal-locales.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const langs = ["de", "fr", "ro", "it", "es", "sv", "no", "nl", "bg"];

function collectKeys(obj, prefix = "") {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...collectKeys(v, p));
    } else {
      keys.push(p);
    }
  }
  return keys;
}

const en = JSON.parse(fs.readFileSync(path.join(root, "src/i18n/locales/en.json"), "utf8"));
const enLegalKeys = new Set(collectKeys(en.legal));

let failed = false;

for (const lang of langs) {
  const localePath = path.join(root, "src/i18n/locales", `${lang}.json`);
  const transPath = path.join(root, "src/i18n/legal-translations", `${lang}.json`);

  if (!fs.existsSync(transPath)) {
    console.error(`Missing ${transPath}`);
    failed = true;
    continue;
  }

  const locale = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const trans = JSON.parse(fs.readFileSync(transPath, "utf8"));

  locale.legal = trans.legal;
  if (trans.subscribe) Object.assign(locale.subscribe, trans.subscribe);
  if (trans.stripeConnect) Object.assign(locale.stripeConnect, trans.stripeConnect);

  const langKeys = new Set(collectKeys(locale.legal));
  const missing = [...enLegalKeys].filter((k) => !langKeys.has(k));
  const extra = [...langKeys].filter((k) => !enLegalKeys.has(k));

  if (missing.length) {
    console.error(`${lang}: missing keys:`, missing.join(", "));
    failed = true;
  }
  if (extra.length) {
    console.warn(`${lang}: extra keys:`, extra.join(", "));
  }

  fs.writeFileSync(localePath, `${JSON.stringify(locale, null, 2)}\n`);
  console.log(`Updated ${lang}.json`);
}

if (failed) process.exit(1);
console.log("All legal locales synced.");

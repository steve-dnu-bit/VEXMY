import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, "../src/i18n/locales");
const en = JSON.parse(readFileSync(join(localesDir, "en.json"), "utf8"));

/** Keys where English copy changed — force re-sync from en before translating. */
const STALE_PATHS = [
  "marketing.pricingSubtitle",
  "pricing.starter.description",
  "pricing.studio.description",
  "pricing.enterprise.description",
  "pricing.faq.includedA",
];

function getByPath(obj, dotPath) {
  return dotPath.split(".").reduce((cur, part) => cur?.[part], obj);
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

for (const file of readdirSync(localesDir).filter((f) => f.endsWith(".json") && f !== "en.json" && !f.startsWith("_"))) {
  const path = join(localesDir, file);
  const locale = JSON.parse(readFileSync(path, "utf8"));
  let updated = 0;

  for (const dotPath of STALE_PATHS) {
    const enVal = getByPath(en, dotPath);
    if (enVal === undefined) continue;
    const cur = getByPath(locale, dotPath);
    if (cur !== enVal) {
      setByPath(locale, dotPath, enVal);
      updated++;
    }
  }

  if (updated) {
    writeFileSync(path, JSON.stringify(locale, null, 2) + "\n", "utf8");
    console.log(`${file}: refreshed ${updated} stale keys`);
  } else {
    console.log(`${file}: up to date`);
  }
}

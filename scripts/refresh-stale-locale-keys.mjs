import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, "../src/i18n/locales");
const en = JSON.parse(readFileSync(join(localesDir, "en.json"), "utf8"));

/** Keys where English copy changed — force re-sync from en before translating. */
const STALE_PATHS = [
  "marketing.pricingSubtitle",
  "pricing.trialBadge",
  "pricing.paidImmediatelyBadge",
  "pricing.solo.name",
  "pricing.solo.tagline",
  "pricing.solo.description",
  "pricing.solo.seats",
  "pricing.solo.cta",
  "pricing.starter.description",
  "pricing.studio.description",
  "pricing.enterprise.description",
  "pricing.comparison.unifiedInbox",
  "pricing.comparison.contactCentre",
  "pricing.comparison.inboxStudio",
  "pricing.comparison.inboxEnterprise",
  "pricing.faq.includedA",
  "pricing.faq.trialA",
  "pricing.faq.switchA",
  "pricing.inboxFeatures.solo.0",
  "pricing.inboxFeatures.solo.1",
  "pricing.inboxFeatures.solo.2",
  "pricing.inboxFeatures.starter.0",
  "pricing.inboxFeatures.starter.1",
  "pricing.inboxFeatures.starter.2",
  "pricing.inboxFeatures.studio.0",
  "pricing.inboxFeatures.studio.1",
  "pricing.inboxFeatures.studio.2",
  "pricing.inboxFeatures.enterprise.0",
  "pricing.inboxFeatures.enterprise.1",
  "pricing.inboxFeatures.enterprise.2",
  "pricing.coreFeatures.0",
  "pricing.coreFeatures.1",
  "pricing.coreFeatures.2",
  "pricing.coreFeatures.3",
  "pricing.coreFeatures.4",
  "pricing.coreFeatures.5",
  "pricing.coreFeatures.6",
  "admin.staffFeatureAccessDesc",
  "customerDeposits.depositSubtitle",
  "stencil.subtitle",
  "stencil.downloadRemovesFiles",
  "stencil.generatedDesc",
  "stencil.downloadStartedDesc",
];

/** If a locale value still contains these English phrases, replace with current en.json copy. */
const STALE_ENGLISH_SNIPPETS = [
  "Client contact centre",
  "Unified inbox",
  "The full Velbok platform",
  "Full platform for shops",
  "Every plan includes scheduling",
  "Upload a reference and generate a black line-art",
  "Download removes the original",
  "Artists and admins - not customer",
  "Pay your £",
  "Drag the slider to compare. Files are removed from the server",
  "Original and stencil have been removed from storage",
  "WhatsApp, SMS & email with message templates",
];

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

function looksStaleEnglish(value) {
  if (typeof value !== "string") return false;
  return STALE_ENGLISH_SNIPPETS.some((snippet) => value.includes(snippet));
}

const enFlat = flatten(en);

for (const file of readdirSync(localesDir).filter((f) => f.endsWith(".json") && f !== "en.json" && !f.startsWith("_"))) {
  const path = join(localesDir, file);
  const locale = JSON.parse(readFileSync(path, "utf8"));
  const locFlat = flatten(locale);
  const touched = new Set();
  let updated = 0;

  for (const dotPath of STALE_PATHS) {
    const enVal = getByPath(en, dotPath);
    if (enVal === undefined) continue;
    const cur = getByPath(locale, dotPath);
    if (cur !== enVal) {
      setByPath(locale, dotPath, enVal);
      touched.add(dotPath);
      updated++;
    }
  }

  for (const dotPath of Object.keys(enFlat)) {
    if (touched.has(dotPath)) continue;
    const enVal = enFlat[dotPath];
    const cur = locFlat[dotPath];
    if (typeof enVal !== "string" || typeof cur !== "string") continue;
    if (cur === enVal) continue;
    if (!looksStaleEnglish(cur)) continue;
    setByPath(locale, dotPath, enVal);
    updated++;
  }

  if (updated) {
    writeFileSync(path, JSON.stringify(locale, null, 2) + "\n", "utf8");
    console.log(`${file}: refreshed ${updated} stale keys`);
  } else {
    console.log(`${file}: up to date`);
  }
}

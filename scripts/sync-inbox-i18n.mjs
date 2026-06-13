/**
 * Merges unified inbox + pricing keys from en.json into other locale files.
 * Run: node scripts/sync-inbox-i18n.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, "..", "src", "i18n", "locales");

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object"
    ) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

const en = JSON.parse(readFileSync(join(localesDir, "en.json"), "utf8"));

const patch = {
  nav: { contact: en.nav.contact },
  pricing: {
    coreFeatures: en.pricing.coreFeatures,
    inboxFeatures: en.pricing.inboxFeatures,
    comparison: en.pricing.comparison,
    faq: {
      includedA: en.pricing.faq.includedA,
    },
    starter: {
      description: en.pricing.starter.description,
    },
    studio: {
      description: en.pricing.studio.description,
    },
    enterprise: {
      description: en.pricing.enterprise.description,
    },
  },
  unifiedInbox: en.unifiedInbox,
  customer: {
    contactStudio: en.customer.contactStudio,
    contactStudioDesc: en.customer.contactStudioDesc,
    emailStudio: en.customer.emailStudio,
    contactCardTitle: en.customer.contactCardTitle,
    contactCardDesc: en.customer.contactCardDesc,
  },
  schedule: {
    openInbox: en.schedule.openInbox,
  },
};

const locales = readdirSync(localesDir).filter((f) => f.endsWith(".json") && f !== "en.json");

for (const file of locales) {
  const path = join(localesDir, file);
  const data = JSON.parse(readFileSync(path, "utf8"));
  deepMerge(data, patch);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log("patched", file);
}

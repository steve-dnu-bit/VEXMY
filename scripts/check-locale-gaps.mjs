import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const KEEP = new Set([
  "Paris", "London", "Tokyo", "Rome", "Berlin", "Madrid", "Admin", "CSV", "JSON",
  "SMS", "VIP", "Laser", "Chat", "Stripe", "Velbok", "Supabase", "SLA", "PMU",
  "PDF", "HTML", "URL", "JPG", "PNG", "WebP", "SMTP", "SSL", "Resend", "GBP",
  "Studio", "Starter", "Enterprise", "Solo", "OK", "Email", "WhatsApp",
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

function checkPair(enPath, langPath, lang) {
  if (!existsSync(langPath)) return { missing: 0, same: 0, samples: [] };
  const en = JSON.parse(readFileSync(enPath, "utf8"));
  const loc = JSON.parse(readFileSync(langPath, "utf8"));
  const enFlat = flatten(en);
  const locFlat = flatten(loc);
  const missing = Object.keys(enFlat).filter((k) => !(k in locFlat));
  const same = Object.keys(enFlat).filter((k) => {
    const enVal = enFlat[k];
    const locVal = locFlat[k];
    return (
      typeof enVal === "string" &&
      locVal === enVal &&
      enVal.length > 8 &&
      !KEEP.has(enVal.trim()) &&
      !/^https?:\/\//.test(enVal) &&
      !/^[a-z0-9._-]+@[a-z0-9.-]+$/i.test(enVal)
    );
  });
  return {
    missing: missing.length,
    same: same.length,
    samples: same.slice(0, 8).map((k) => `${k}: ${enFlat[k].slice(0, 70)}`),
  };
}

const langs = ["de", "fr", "ro", "it", "es", "sv", "no", "nl", "bg", "uk"];

console.log("=== Main UI locales ===");
for (const lang of langs) {
  const r = checkPair(
    join(root, "src/i18n/locales/en.json"),
    join(root, "src/i18n/locales", `${lang}.json`),
    lang
  );
  console.log(`${lang}: missing=${r.missing} sameAsEn=${r.same}`);
  r.samples.forEach((s) => console.log(`  ${s}`));
}

console.log("\n=== Docs locales ===");
for (const lang of langs) {
  const r = checkPair(
    join(root, "src/i18n/locales/docs/en.json"),
    join(root, "src/i18n/locales/docs", `${lang}.json`),
    lang
  );
  console.log(`${lang}: missing=${r.missing} sameAsEn=${r.same}`);
  r.samples.forEach((s) => console.log(`  ${s}`));
}

console.log("\n=== Email locales ===");
for (const lang of langs.filter((l) => l !== "uk")) {
  const r = checkPair(
    join(root, "supabase/functions/_shared/email-locales/en.json"),
    join(root, "supabase/functions/_shared/email-locales", `${lang}.json`),
    lang
  );
  console.log(`${lang}: missing=${r.missing} sameAsEn=${r.same}`);
  r.samples.forEach((s) => console.log(`  ${s}`));
}

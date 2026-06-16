import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, "../src/i18n/locales");

function deepMerge(base, overlay) {
  if (typeof base !== "object" || base === null) return overlay ?? base;
  if (typeof overlay !== "object" || overlay === null) return overlay ?? base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const key of Object.keys(overlay)) {
    if (typeof overlay[key] === "object" && overlay[key] !== null && !Array.isArray(overlay[key])) {
      out[key] = deepMerge(base[key] ?? {}, overlay[key]);
    } else {
      out[key] = overlay[key];
    }
  }
  return out;
}

const enPath = join(localesDir, "en.json");
const extPath = join(__dirname, "en-i18n-extensions.json");
const en = JSON.parse(readFileSync(enPath, "utf8"));
const ext = JSON.parse(readFileSync(extPath, "utf8"));
const merged = deepMerge(en, ext);
writeFileSync(enPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
console.log("Merged extensions into en.json");

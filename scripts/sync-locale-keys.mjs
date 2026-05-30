import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, "../src/i18n/locales");
const en = JSON.parse(readFileSync(join(localesDir, "en.json"), "utf8"));

function deepMerge(base, overlay) {
  if (typeof base !== "object" || base === null) return overlay ?? base;
  if (typeof overlay !== "object" || overlay === null) return overlay ?? base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const key of Object.keys(overlay)) {
    if (typeof overlay[key] === "object" && overlay[key] !== null && !Array.isArray(overlay[key])) {
      out[key] = deepMerge(base[key] ?? {}, overlay[key]);
    } else if (!(key in out)) {
      out[key] = overlay[key];
    }
  }
  return out;
}

for (const file of readdirSync(localesDir).filter((f) => f.endsWith(".json") && f !== "en.json")) {
  const path = join(localesDir, file);
  const locale = JSON.parse(readFileSync(path, "utf8"));
  const merged = deepMerge(locale, en);
  writeFileSync(path, JSON.stringify(merged, null, 2) + "\n", "utf8");
  console.log("Synced", file);
}

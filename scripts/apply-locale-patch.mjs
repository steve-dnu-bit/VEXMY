import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, "../src/i18n/locales");
const patchPath = process.argv[2] ?? join(__dirname, "locale-new-keys-patch.json");

if (!existsSync(patchPath)) {
  console.error("Patch file not found:", patchPath);
  console.error("Pass a path: node scripts/apply-locale-patch.mjs path/to/patch.json");
  process.exit(1);
}

const patch = JSON.parse(readFileSync(patchPath, "utf8"));

function setByPath(obj, dotPath, value) {
  const parts = dotPath.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] ??= {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

for (const [lang, keys] of Object.entries(patch)) {
  const localePath = join(localesDir, `${lang}.json`);
  const locale = JSON.parse(readFileSync(localePath, "utf8"));
  for (const [key, value] of Object.entries(keys)) {
    setByPath(locale, key, value);
  }
  writeFileSync(localePath, JSON.stringify(locale, null, 2) + "\n", "utf8");
  console.log(`${lang}: applied ${Object.keys(keys).length} keys`);
}

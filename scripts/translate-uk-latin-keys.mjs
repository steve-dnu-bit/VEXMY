import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { translate } from "google-translate-api-x";

const __dirname = dirname(fileURLToPath(import.meta.url));
const localePath = join(__dirname, "../src/i18n/locales/uk.json");
const BATCH_SIZE = 30;

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

function setByPath(obj, dotPath, value) {
  const parts = dotPath.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] ??= {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function needsTranslation(value) {
  if (typeof value !== "string" || value.length < 15) return false;
  if (/[а-яА-ЯіїєґІЇЄҐ]/.test(value)) return false;
  if (value.startsWith("http") || value.includes("velbok.com")) return false;
  if (/^\{\{.*\}\}$/.test(value.trim())) return false;
  return /[a-zA-Z]{4,}/.test(value);
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

async function translateBatch(items) {
  const texts = items.map((i) => i.protectedText);
  const results = await translate(texts, { from: "en", to: "uk", forceBatch: true });
  const arr = Array.isArray(results) ? results : [results];
  return arr.map((r, idx) => restoreInterpolation(r.text, items[idx].tokens));
}

async function main() {
  const locale = JSON.parse(readFileSync(localePath, "utf8"));
  const flat = flatten(locale);
  const todo = Object.keys(flat).filter((k) => needsTranslation(flat[k]));

  console.log(`uk: translating ${todo.length} latin-only keys...`);
  const pending = todo.map((key) => {
    const text = flat[key];
    const { protectedText, tokens } = protectInterpolation(text);
    return { key, text, protectedText, tokens };
  });

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const chunk = pending.slice(i, i + BATCH_SIZE);
    const results = await translateBatch(chunk);
    chunk.forEach((item, idx) => setByPath(locale, item.key, results[idx] ?? item.text));
    writeFileSync(localePath, JSON.stringify(locale, null, 2) + "\n", "utf8");
    console.log(`  ${Math.min(i + BATCH_SIZE, pending.length)}/${pending.length}`);
  }

  console.log("uk: done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

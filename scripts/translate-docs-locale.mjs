import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { translate } from "@vitalets/google-translate-api";

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsDir = join(__dirname, "..", "src/i18n/locales/docs");

const TARGETS = {
  de: "de",
  fr: "fr",
  ro: "ro",
  it: "it",
  es: "es",
  sv: "sv",
  no: "no",
  nl: "nl",
  bg: "bg",
};

const SKIP_PATTERN = /^\{\{.*\}\}$/;

async function translateText(text, to) {
  if (!text || typeof text !== "string") return text;
  if (SKIP_PATTERN.test(text.trim())) return text;
  const { text: translated } = await translate(text, { from: "en", to });
  return translated;
}

async function walk(value, to) {
  if (typeof value === "string") {
    await new Promise((r) => setTimeout(r, 120));
    return translateText(value, to);
  }
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      out.push(await walk(item, to));
    }
    return out;
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = await walk(child, to);
    }
    return out;
  }
  return value;
}

async function main() {
  const en = JSON.parse(readFileSync(join(docsDir, "en.json"), "utf8"));
  const langs = process.argv.slice(2);
  const selected = langs.length ? langs : Object.keys(TARGETS);

  for (const code of selected) {
    const googleCode = TARGETS[code];
    if (!googleCode) {
      console.warn("Skip unknown locale:", code);
      continue;
    }
    console.log(`Translating docs → ${code}...`);
    const translated = await walk(structuredClone(en), googleCode);
    writeFileSync(join(docsDir, `${code}.json`), JSON.stringify(translated, null, 2) + "\n", "utf8");
    console.log(`Wrote docs/${code}.json`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

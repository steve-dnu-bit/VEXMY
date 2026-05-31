import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = readFileSync(join(root, "src/lib/docsContent.ts"), "utf8");

const categoriesMatch = src.match(/export const DOC_CATEGORIES = (\[[\s\S]*?\]) as const;/);
const pagesMatch = src.match(/export const DOC_PAGES: DocPage\[\] = (\[[\s\S]*?\]);/);
if (!categoriesMatch || !pagesMatch) throw new Error("Could not parse docsContent.ts");

const categories = eval(categoriesMatch[1]);
const pages = eval(pagesMatch[1]);

const locale = {
  indexTitle: "Documentation",
  indexSubtitle:
    "Guides for studio staff, admins, and technical setup. Select a topic from the sidebar or browse by category below.",
  allDocs: "All docs",
  breadcrumb: "Docs",
  next: "Next: {{title}} →",
  categories: Object.fromEntries(categories.map((c) => [c.id, c.label])),
  pages: Object.fromEntries(
    pages.map((p) => [
      p.slug,
      {
        title: p.title,
        description: p.description,
        sections: p.sections,
      },
    ]),
  ),
};

const outDir = join(root, "src/i18n/locales/docs");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "en.json"), JSON.stringify(locale, null, 2) + "\n", "utf8");
console.log("Wrote docs/en.json with", pages.length, "pages");

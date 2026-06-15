import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const siteUrl = "https://velbok.com";

const docsSource = readFileSync(path.join(root, "src/lib/docsContent.ts"), "utf8");
const docSlugs = [...docsSource.matchAll(/slug: "([^"]+)"/g)].map((match) => match[1]);

const staticPaths = [
  "/",
  "/pricing",
  "/contact",
  "/subscribe",
  "/docs",
  "/terms",
  "/privacy",
  "/cookies",
  ...docSlugs.map((slug) => `/docs/${slug}`),
];

const lastmod = new Date().toISOString().slice(0, 10);

const urls = staticPaths
  .map((pathname) => {
    const priority = pathname === "/" ? "1.0" : pathname.startsWith("/docs/") ? "0.6" : "0.8";
    const changefreq = pathname === "/" ? "weekly" : "monthly";
    return `  <url>
    <loc>${siteUrl}${pathname === "/" ? "/" : pathname}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
  })
  .join("\n");

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

writeFileSync(path.join(root, "public/sitemap.xml"), sitemap, "utf8");
console.log(`Generated sitemap with ${staticPaths.length} URLs.`);

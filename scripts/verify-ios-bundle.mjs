import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "ios/App/App/public");
const indexHtml = path.join(publicDir, "index.html");
const capacitorConfig = path.join(root, "ios/App/App/capacitor.config.json");

const missing = [];
if (!fs.existsSync(indexHtml)) missing.push("ios/App/App/public/index.html");
if (!fs.existsSync(capacitorConfig)) missing.push("ios/App/App/capacitor.config.json");

if (missing.length > 0) {
  console.error("[verify-ios-bundle] Missing iOS web bundle:");
  for (const file of missing) console.error(`  - ${file}`);
  console.error("The bundle is generated, not committed — a fresh clone has none until you run:");
  console.error("  npm run ios:prepare");
  process.exit(1);
}

const assetsDir = path.join(publicDir, "assets");
const assetCount = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir).length : 0;
if (assetCount < 5) {
  console.error(`[verify-ios-bundle] ios/App/App/public/assets looks empty (${assetCount} files).`);
  console.error("Run: npm run ios:prepare");
  process.exit(1);
}

console.log(`[verify-ios-bundle] OK (${assetCount} assets in public bundle)`);

/**
 * Copy a downloaded GoogleService-Info.plist into the iOS app folder.
 *
 * Usage:
 *   node scripts/install-ios-google-services.mjs "C:\Users\you\Downloads\GoogleService-Info.plist"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "ios/App/App/GoogleService-Info.plist");
const src = process.argv[2];

if (!src) {
  console.error("Usage: node scripts/install-ios-google-services.mjs <path-to-GoogleService-Info.plist>");
  process.exit(1);
}

if (!fs.existsSync(src)) {
  console.error(`File not found: ${src}`);
  process.exit(1);
}

const text = fs.readFileSync(src, "utf8");
if (!text.includes("BUNDLE_ID") || !text.includes("GOOGLE_APP_ID")) {
  console.error("That file does not look like a Firebase GoogleService-Info.plist");
  process.exit(1);
}
if (!text.includes("com.velbok.app")) {
  console.warn("Warning: BUNDLE_ID may not be com.velbok.app — check the file.");
}

fs.copyFileSync(src, dest);
console.log(`Installed → ${dest}`);
console.log("Next: npm run verify:ios-push");

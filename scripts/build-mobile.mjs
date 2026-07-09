/**
 * Web bundle for Capacitor — must NOT include the website APK download artifact.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distDownloads = path.join(root, "dist/downloads");

const result = spawnSync("npx", ["vite", "build"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    VITE_MOBILE_BUILD: "1",
    VITE_SITE_URL: process.env.VITE_SITE_URL || "https://velbok.com",
    VITE_SHOP_WEBSITE_URL: process.env.VITE_SHOP_WEBSITE_URL || "https://velbok.com",
    VITE_GOOGLE_CLIENT_ID:
      process.env.VITE_GOOGLE_CLIENT_ID ||
      "843973604535-hh4010q2pagr6m72esbh9mlddattg65i.apps.googleusercontent.com",
  },
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

/** Never ship APK download artifacts inside the Capacitor WebView bundle. */
function removeApkArtifactsFromDist() {
  const removed = [];
  const downloadsDir = distDownloads;
  if (fs.existsSync(downloadsDir)) {
    for (const entry of fs.readdirSync(downloadsDir)) {
      if (entry.toLowerCase().endsWith(".apk")) {
        const file = path.join(downloadsDir, entry);
        fs.unlinkSync(file);
        removed.push(path.relative(root, file));
      }
    }
  }
  for (const entry of fs.readdirSync(path.join(root, "dist"))) {
    if (entry.toLowerCase().endsWith(".apk")) {
      const file = path.join(root, "dist", entry);
      fs.unlinkSync(file);
      removed.push(path.relative(root, file));
    }
  }
  for (const rel of removed) {
    console.log(`[build-mobile] Removed ${rel} from dist`);
  }
}

const publicDownloads = path.join(root, "public/downloads");
if (fs.existsSync(publicDownloads)) {
  const strayApks = fs.readdirSync(publicDownloads).filter((n) => n.toLowerCase().endsWith(".apk"));
  if (strayApks.length > 0) {
    console.warn(
      `[build-mobile] Warning: public/downloads contains APK(s) that would bloat the mobile app: ${strayApks.join(", ")}. ` +
        "Keep release APKs in releases/ only; public/downloads should have android-version.json.",
    );
  }
}

removeApkArtifactsFromDist();

/** Strip interactive-widget from mobile bundle — causes WebView overlay glitches on Android. */
const indexPath = path.join(root, "dist/index.html");
if (fs.existsSync(indexPath)) {
  const html = fs
    .readFileSync(indexPath, "utf8")
    .replace(/,?\s*interactive-widget=resizes-content/g, "");
  fs.writeFileSync(indexPath, html);
  console.log("[build-mobile] Stripped interactive-widget from dist/index.html");
}

for (const name of ["android-version.json"]) {
  const file = path.join(distDownloads, name);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    console.log(`[build-mobile] Removed ${path.relative(root, file)} from dist`);
  }
}

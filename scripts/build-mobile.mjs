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
  env: { ...process.env, VITE_MOBILE_BUILD: "1" },
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

// Vite copies public/downloads/*.apk into dist — never ship those inside the Capacitor bundle.
for (const dir of [path.join(root, "dist"), distDownloads]) {
  if (!fs.existsSync(dir)) continue;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".apk")) continue;
    const file = path.join(dir, entry.name);
    fs.unlinkSync(file);
    console.log(`[build-mobile] Removed ${path.relative(root, file)} from mobile bundle`);
  }
}

for (const name of ["velbok-android.apk", "android-version.json"]) {
  const file = path.join(distDownloads, name);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    console.log(`[build-mobile] Removed ${path.relative(root, file)} from dist`);
  }
}

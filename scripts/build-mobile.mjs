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
    VITE_GOOGLE_CLIENT_ID:
      process.env.VITE_GOOGLE_CLIENT_ID ||
      "843973604535-hh4010q2pagr6m72esbh9mlddattg65i.apps.googleusercontent.com",
  },
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

for (const name of ["velbok-android.apk", "android-version.json"]) {
  const file = path.join(distDownloads, name);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    console.log(`[build-mobile] Removed ${path.relative(root, file)} from dist`);
  }
}

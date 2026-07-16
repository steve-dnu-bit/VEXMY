/**
 * Website download helper — delegates to archive-android-release.mjs so every
 * release is also saved under releases/app-versions with versioned names:
 *   apk/velbok-{version}-build{code}.apk
 *   aab/velbok-{version}-build{code}.aab
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, "archive-android-release.mjs");
const result = spawnSync(process.execPath, [script], { stdio: "inherit" });
process.exit(result.status ?? 1);

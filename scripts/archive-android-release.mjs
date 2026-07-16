/**
 * Archive signed Android release APK + AAB into the consistent versioned layout:
 *   releases/app-versions/apk/velbok-{versionName}-build{versionCode}.apk
 *   releases/app-versions/aab/velbok-{versionName}-build{versionCode}.aab
 *
 * Also refreshes:
 *   releases/velbok-release.apk / .aab  (latest convenience copies)
 *   public/downloads/velbok-android.apk + android-version.json
 *   releases/app-versions/versions.json (latest pointers)
 *
 * Prefer freshly built Gradle outputs; fall back to releases/velbok-release.* if present.
 *
 * Usage: node scripts/archive-android-release.mjs
 * Also invoked by: node scripts/copy-release-apk.mjs (website build pipeline)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const buildGradle = path.join(root, "android/app/build.gradle");
const gradleApk = path.join(root, "android/app/build/outputs/apk/release/app-release.apk");
const gradleAab = path.join(root, "android/app/build/outputs/bundle/release/app-release.aab");
const latestApk = path.join(root, "releases/velbok-release.apk");
const latestAab = path.join(root, "releases/velbok-release.aab");
const archiveRoot = path.join(root, "releases/app-versions");
const archiveApkDir = path.join(archiveRoot, "apk");
const archiveAabDir = path.join(archiveRoot, "aab");
const versionsJsonPath = path.join(archiveRoot, "versions.json");
const publicDir = path.join(root, "public/downloads");
const publicApk = path.join(publicDir, "velbok-android.apk");
const publicVersionJson = path.join(publicDir, "android-version.json");

function readAppVersion() {
  const gradle = fs.readFileSync(buildGradle, "utf8");
  const versionName = gradle.match(/versionName\s+"([^"]+)"/)?.[1] ?? "unknown";
  const versionCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1] ?? 0);
  return { versionName, versionCode };
}

function resolveSource(preferred, fallback) {
  if (fs.existsSync(preferred)) return preferred;
  if (fs.existsSync(fallback)) return fallback;
  return null;
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return fs.statSync(dest).size;
}

function updateVersionsManifest({ versionName, versionCode, apkRel, aabRel, apkBytes, aabBytes, hasApk, hasAab }) {
  let manifest = {
    packageId: "com.velbok.app",
    exportedAt: new Date().toISOString().slice(0, 10),
    note: `${versionName}: archived Android release.`,
    releases: [],
  };

  if (fs.existsSync(versionsJsonPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(versionsJsonPath, "utf8"));
    } catch {
      // keep defaults
    }
  }

  const releases = Array.isArray(manifest.releases) ? manifest.releases : [];
  const next = releases
    .filter((r) => !(r.versionCode === versionCode && (r.format === "apk" || r.format === "aab")))
    .map((r) =>
      r.status === "latest" || r.status === "play-store-bundle"
        ? { ...r, status: "superseded" }
        : r,
    );

  if (hasApk) {
    next.unshift({
      versionName,
      versionCode,
      format: "apk",
      file: apkRel,
      status: "latest",
      installable: true,
      sizeBytes: apkBytes,
    });
  }
  if (hasAab) {
    next.unshift({
      versionName,
      versionCode,
      format: "aab",
      file: aabRel,
      status: "play-store-bundle",
      installable: false,
      sizeBytes: aabBytes,
    });
  }

  // Keep AAB first when both exist (Play upload path), then APK as latest sideload.
  if (hasApk && hasAab) {
    const apkEntry = next.find((r) => r.versionCode === versionCode && r.format === "apk");
    const aabEntry = next.find((r) => r.versionCode === versionCode && r.format === "aab");
    const rest = next.filter((r) => r.versionCode !== versionCode || (r.format !== "apk" && r.format !== "aab"));
    next.length = 0;
    if (apkEntry) next.push(apkEntry);
    if (aabEntry) next.push(aabEntry);
    next.push(...rest);
  }

  manifest.packageId = "com.velbok.app";
  manifest.exportedAt = new Date().toISOString().slice(0, 10);
  manifest.note = `${versionName} (build ${versionCode}): archived Android release.`;
  manifest.releases = next;

  fs.writeFileSync(versionsJsonPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

const { versionName, versionCode } = readAppVersion();
const baseName = `velbok-${versionName}-build${versionCode}`;
const apkRel = `apk/${baseName}.apk`;
const aabRel = `aab/${baseName}.aab`;

const apkSource = resolveSource(gradleApk, latestApk);
const aabSource = resolveSource(gradleAab, latestAab);

if (!apkSource && !aabSource) {
  console.warn(
    "[archive-android-release] No APK/AAB found. Build with gradle assembleRelease bundleRelease first.",
  );
  process.exit(0);
}

const archived = [];
let apkBytes = 0;
let aabBytes = 0;

if (apkSource) {
  apkBytes = copyFile(apkSource, path.join(archiveApkDir, `${baseName}.apk`));
  copyFile(apkSource, latestApk);
  copyFile(apkSource, publicApk);
  fs.writeFileSync(
    publicVersionJson,
    JSON.stringify(
      {
        versionName,
        versionCode,
        packageId: "com.velbok.app",
        filename: "velbok-android.apk",
        downloadUrl: "/downloads/velbok-android.apk",
        sizeBytes: apkBytes,
        updatedAt: new Date().toISOString().slice(0, 10),
        archivePath: `releases/app-versions/${apkRel}`,
      },
      null,
      2,
    ),
    "utf8",
  );
  archived.push(`${apkRel} (${(apkBytes / (1024 * 1024)).toFixed(1)} MB)`);
}

if (aabSource) {
  aabBytes = copyFile(aabSource, path.join(archiveAabDir, `${baseName}.aab`));
  copyFile(aabSource, latestAab);
  archived.push(`${aabRel} (${(aabBytes / (1024 * 1024)).toFixed(1)} MB)`);
}

updateVersionsManifest({
  versionName,
  versionCode,
  apkRel,
  aabRel,
  apkBytes,
  aabBytes,
  hasApk: Boolean(apkSource),
  hasAab: Boolean(aabSource),
});

console.log(`[archive-android-release] ${baseName}`);
for (const line of archived) {
  console.log(`  → releases/app-versions/${line}`);
}
if (apkSource) {
  console.log("  → public/downloads/velbok-android.apk");
  console.log("  → releases/velbok-release.apk");
}
if (aabSource) {
  console.log("  → releases/velbok-release.aab");
}

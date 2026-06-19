/**
 * Copy signed Android release APK into public/ for website download.
 * Source: releases/velbok-release.apk (build with android/gradlew assembleRelease first).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sourceApk = path.join(root, "releases/velbok-release.apk");
const destDir = path.join(root, "public/downloads");
const destApk = path.join(destDir, "velbok-android.apk");
const versionJson = path.join(destDir, "android-version.json");
const buildGradle = path.join(root, "android/app/build.gradle");

function readAppVersion() {
  const gradle = fs.readFileSync(buildGradle, "utf8");
  const versionName = gradle.match(/versionName\s+"([^"]+)"/)?.[1] ?? "unknown";
  const versionCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1] ?? 0);
  return { versionName, versionCode };
}

if (!fs.existsSync(sourceApk)) {
  console.warn(
    "[copy-release-apk] Skip — releases/velbok-release.apk not found. Build APK first or download will be unavailable.",
  );
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(sourceApk, destApk);

const stat = fs.statSync(destApk);
const { versionName, versionCode } = readAppVersion();

fs.writeFileSync(
  versionJson,
  JSON.stringify(
    {
      versionName,
      versionCode,
      packageId: "com.velbok.app",
      filename: "velbok-android.apk",
      downloadUrl: "/downloads/velbok-android.apk",
      sizeBytes: stat.size,
      updatedAt: new Date().toISOString().slice(0, 10),
    },
    null,
    2,
  ),
  "utf8",
);

const sizeMb = (stat.size / (1024 * 1024)).toFixed(1);
console.log(`[copy-release-apk] velbok-android.apk v${versionName} (${versionCode}) — ${sizeMb} MB → public/downloads/`);

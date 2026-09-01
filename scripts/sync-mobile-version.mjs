import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "scripts/mobile-version.json"), "utf8"));
const { versionName } = version;
const versionCode = Number(version.versionCode ?? version.buildNumber);

if (!versionName || !Number.isInteger(versionCode) || versionCode <= 0) {
  console.error(
    "[sync-mobile-version] scripts/mobile-version.json must include versionName and a positive integer versionCode.",
  );
  console.error("Example: { \"versionName\": \"1.0.54\", \"versionCode\": 54, \"packageId\": \"com.velbok.app\" }");
  process.exit(1);
}

/** Every path written below, so callers can stage the complete set. */
const written = [];

function write(relPath, contents) {
  writeFileSync(join(root, relPath), contents);
  written.push(relPath);
}

const gradlePath = join(root, "android/app/build.gradle");
let gradle = readFileSync(gradlePath, "utf8");
gradle = gradle.replace(/versionCode \S+/, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName "[^"]+"/, `versionName "${versionName}"`);
write("android/app/build.gradle", gradle);
console.log(`Android: ${versionName} (${versionCode})`);

const pbxPath = join(root, "ios/App/App.xcodeproj/project.pbxproj");
let pbx = readFileSync(pbxPath, "utf8");
pbx = pbx.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${versionName};`);
pbx = pbx.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${versionCode};`);
write("ios/App/App.xcodeproj/project.pbxproj", pbx);
console.log(`iOS: ${versionName} (${versionCode})`);

const androidVersionJson = {
  versionName,
  versionCode,
  packageId: version.packageId,
  filename: "velbok-android.apk",
  downloadUrl: "/downloads/velbok-android.apk",
  updatedAt: new Date().toISOString().slice(0, 10),
};
write("public/downloads/android-version.json", `${JSON.stringify(androidVersionJson, null, 2)}\n`);

const iosVersionJson = {
  versionName,
  buildNumber: versionCode,
  bundleId: version.packageId,
  distribution: "app-store",
  updatedAt: new Date().toISOString().slice(0, 10),
};
write("public/downloads/ios-version.json", `${JSON.stringify(iosVersionJson, null, 2)}\n`);

console.log(`\n[sync-mobile-version] Stamped ${versionName} (${versionCode}) into ${written.length} file(s):`);
for (const relPath of written) console.log(`  ${relPath}`);
console.log("\nStage all of them or the bump is only half committed:");
console.log(`  git add ${written.join(" ")}`);
console.log("The Capacitor web bundle under ios/App/App/public is refreshed by cap sync, not by this script.");

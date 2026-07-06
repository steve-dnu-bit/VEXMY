import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "scripts/mobile-version.json"), "utf8"));
const { versionName, versionCode } = version;

const gradlePath = join(root, "android/app/build.gradle");
let gradle = readFileSync(gradlePath, "utf8");
gradle = gradle.replace(/versionCode \d+/, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName "[^"]+"/, `versionName "${versionName}"`);
writeFileSync(gradlePath, gradle);
console.log(`Android: ${versionName} (${versionCode})`);

const pbxPath = join(root, "ios/App/App.xcodeproj/project.pbxproj");
let pbx = readFileSync(pbxPath, "utf8");
pbx = pbx.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${versionName};`);
pbx = pbx.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${versionCode};`);
writeFileSync(pbxPath, pbx);
console.log(`iOS: ${versionName} (${versionCode})`);

const androidVersionJson = {
  versionName,
  versionCode,
  packageId: version.packageId,
  filename: "velbok-android.apk",
  downloadUrl: "/downloads/velbok-android.apk",
  updatedAt: new Date().toISOString().slice(0, 10),
};
writeFileSync(
  join(root, "public/downloads/android-version.json"),
  `${JSON.stringify(androidVersionJson, null, 2)}\n`,
);
console.log("Wrote public/downloads/android-version.json");

const iosVersionJson = {
  versionName,
  buildNumber: versionCode,
  bundleId: version.packageId,
  distribution: "app-store",
  updatedAt: new Date().toISOString().slice(0, 10),
};
writeFileSync(
  join(root, "public/downloads/ios-version.json"),
  `${JSON.stringify(iosVersionJson, null, 2)}\n`,
);
console.log("Wrote public/downloads/ios-version.json");

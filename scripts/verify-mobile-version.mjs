/**
 * Fail the build if any stamped version disagrees with scripts/mobile-version.json.
 *
 * Catches the two failure modes that have shipped wrong-version iOS builds before:
 *   1. mobile-version.json bumped but sync-mobile-version.mjs output not committed.
 *   2. Native version bumped but the Capacitor web bundle under ios/App/App/public
 *      left at an older build, so the archive runs old JavaScript.
 *
 * Usage:
 *   node scripts/verify-mobile-version.mjs               # check everything
 *   node scripts/verify-mobile-version.mjs --skip-bundle # native + manifests only
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skipBundle = process.argv.includes("--skip-bundle");

const canonical = JSON.parse(readFileSync(join(root, "scripts/mobile-version.json"), "utf8"));
const versionName = canonical.versionName;
const versionCode = Number(canonical.versionCode ?? canonical.buildNumber);

if (!versionName || !Number.isInteger(versionCode) || versionCode <= 0) {
  console.error("[verify-mobile-version] scripts/mobile-version.json is invalid.");
  process.exit(1);
}

const problems = [];
const rows = [];

function record(label, actual, expected) {
  const ok = String(actual) === String(expected);
  rows.push({ label, actual, ok });
  return ok;
}

function fail(message, hint) {
  problems.push({ message, hint });
}

function read(relPath) {
  const abs = join(root, relPath);
  return existsSync(abs) ? readFileSync(abs, "utf8") : null;
}

/* --- Android gradle --------------------------------------------------- */
const gradle = read("android/app/build.gradle");
if (gradle === null) {
  fail("android/app/build.gradle is missing.");
} else {
  const names = [...gradle.matchAll(/versionName\s+"([^"]+)"/g)].map((m) => m[1]);
  const codes = [...gradle.matchAll(/versionCode\s+(\d+)/g)].map((m) => m[1]);
  if (names.length === 0 || codes.length === 0) {
    fail("Could not find versionName/versionCode in android/app/build.gradle.");
  }
  for (const value of names) {
    if (!record("android/app/build.gradle versionName", value, versionName)) {
      fail(`build.gradle versionName is "${value}", expected "${versionName}".`, "node scripts/sync-mobile-version.mjs");
    }
  }
  for (const value of codes) {
    if (!record("android/app/build.gradle versionCode", value, versionCode)) {
      fail(`build.gradle versionCode is ${value}, expected ${versionCode}.`, "node scripts/sync-mobile-version.mjs");
    }
  }
}

/* --- iOS project.pbxproj (every build configuration) ------------------ */
const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
if (pbx === null) {
  fail("ios/App/App.xcodeproj/project.pbxproj is missing.");
} else {
  const marketing = [...pbx.matchAll(/MARKETING_VERSION\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
  const current = [...pbx.matchAll(/CURRENT_PROJECT_VERSION\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
  if (marketing.length === 0 || current.length === 0) {
    fail("project.pbxproj has no MARKETING_VERSION / CURRENT_PROJECT_VERSION.");
  }
  marketing.forEach((value, i) => {
    if (!record(`project.pbxproj MARKETING_VERSION [${i + 1}/${marketing.length}]`, value, versionName)) {
      fail(
        `project.pbxproj MARKETING_VERSION #${i + 1} is ${value}, expected ${versionName}.`,
        "node scripts/sync-mobile-version.mjs  (close Xcode first — it can write back a cached pbxproj)",
      );
    }
  });
  current.forEach((value, i) => {
    if (!record(`project.pbxproj CURRENT_PROJECT_VERSION [${i + 1}/${current.length}]`, value, versionCode)) {
      fail(
        `project.pbxproj CURRENT_PROJECT_VERSION #${i + 1} is ${value}, expected ${versionCode}.`,
        "node scripts/sync-mobile-version.mjs  (close Xcode first — it can write back a cached pbxproj)",
      );
    }
  });
}

/* --- iOS Info.plist must inherit from the build settings -------------- */
const infoPlist = read("ios/App/App/Info.plist");
if (infoPlist === null) {
  fail("ios/App/App/Info.plist is missing.");
} else {
  const expectations = [
    ["CFBundleShortVersionString", "$(MARKETING_VERSION)"],
    ["CFBundleVersion", "$(CURRENT_PROJECT_VERSION)"],
  ];
  for (const [key, expected] of expectations) {
    const match = infoPlist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`));
    const actual = match ? match[1] : "(missing)";
    if (!record(`Info.plist ${key}`, actual, expected)) {
      fail(
        `Info.plist ${key} is "${actual}" — it must be "${expected}" so version bumps take effect.`,
        "Restore the build-setting reference in ios/App/App/Info.plist.",
      );
    }
  }
}

/* --- Web download manifests ------------------------------------------- */
const manifests = [
  ["public/downloads/ios-version.json", "versionName", "buildNumber"],
  ["public/downloads/android-version.json", "versionName", "versionCode"],
];
for (const [relPath, nameKey, codeKey] of manifests) {
  const raw = read(relPath);
  if (raw === null) {
    fail(`${relPath} is missing.`, "node scripts/sync-mobile-version.mjs");
    continue;
  }
  const json = JSON.parse(raw);
  if (!record(`${relPath} ${nameKey}`, json[nameKey], versionName)) {
    fail(`${relPath} ${nameKey} is ${json[nameKey]}, expected ${versionName}.`, "node scripts/sync-mobile-version.mjs");
  }
  if (!record(`${relPath} ${codeKey}`, json[codeKey], versionCode)) {
    fail(`${relPath} ${codeKey} is ${json[codeKey]}, expected ${versionCode}.`, "node scripts/sync-mobile-version.mjs");
  }
}

/* --- Bundled Capacitor web assets (the JS the app actually runs) ------ */
const bundles = [
  ["ios/App/App/public/downloads/ios-version.json", "versionName", "buildNumber"],
  ["android/app/src/main/assets/public/downloads/ios-version.json", "versionName", "buildNumber"],
];
if (!skipBundle) {
  for (const [relPath, nameKey, codeKey] of bundles) {
    const raw = read(relPath);
    if (raw === null) continue; // bundle not generated yet on this machine
    const json = JSON.parse(raw);
    const nameOk = record(`${relPath} ${nameKey}`, json[nameKey], versionName);
    const codeOk = record(`${relPath} ${codeKey}`, json[codeKey], versionCode);
    if (!nameOk || !codeOk) {
      fail(
        `STALE WEB BUNDLE: ${relPath} is ${json[nameKey]} (${json[codeKey]}), expected ${versionName} (${versionCode}).\n` +
          "    The native version would be correct but the app would run older JavaScript.",
        "npm run ios:prepare   (rebuilds dist and re-copies it into the native projects)",
      );
    }
  }
}

/* --- Report ----------------------------------------------------------- */
const width = Math.max(...rows.map((r) => r.label.length), 10);
console.log(`[verify-mobile-version] canonical: ${versionName} (${versionCode})`);
for (const row of rows) {
  console.log(`  ${row.ok ? "ok  " : "FAIL"} ${row.label.padEnd(width)}  ${row.actual}`);
}

if (problems.length > 0) {
  console.error(`\n[verify-mobile-version] ${problems.length} problem(s):`);
  for (const { message, hint } of problems) {
    console.error(`  - ${message}`);
    if (hint) console.error(`    fix: ${hint}`);
  }
  console.error("\nRefusing to continue with a mismatched version.");
  process.exit(1);
}

console.log(`[verify-mobile-version] OK — everything stamped ${versionName} (${versionCode})`);

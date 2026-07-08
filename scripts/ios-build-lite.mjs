import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync, execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const logFile = join(root, "ios-build-lite.log");
const derivedData = join(root, "ios/DerivedData");
const iosAppDir = join(root, "ios/App");

function log(line) {
  console.log(line);
}

function run(cmd, cwd = root) {
  log(`\n$ ${cmd}`);
  const result = spawnSync(cmd, {
    cwd,
    shell: "/bin/bash",
    stdio: "inherit",
    env: process.env,
  });
  return result.status ?? 1;
}

writeFileSync(logFile, `Velbok ios:build-lite started ${new Date().toISOString()}\n`);

console.log("========================================");
console.log("  Velbok iOS LITE build starting NOW");
console.log("  (no Stripe — faster Simulator build)");
console.log("========================================");
console.log(`Log file: ${logFile}`);
console.log("If you see this message, the command is running.\n");

if (process.platform !== "darwin") {
  console.log("FAILED: Run this on a Mac with Xcode.");
  process.exit(1);
}

if (!existsSync(join(root, "node_modules/@capacitor/app"))) {
  console.log("FAILED: Run npm install first.");
  process.exit(1);
}

if (!existsSync(join(root, "ios/App/App/public/index.html"))) {
  log("==> Web bundle missing, running ios:prepare...");
  if (run("npm run ios:prepare") !== 0) process.exit(1);
} else {
  log("==> Using existing web bundle in ios/App/App/public");
}

log("==> Lite packages (no Stripe Terminal)...");
if (run(`node "${join(root, "scripts/ios-lite-packages.mjs")}" lite`) !== 0) process.exit(1);
if (run(`node "${join(root, "scripts/fix-ios-spm-paths.mjs")}"`) !== 0) process.exit(1);

rmSync(derivedData, { recursive: true, force: true });
rmSync(join(root, "ios/App/CapApp-SPM/.build"), { recursive: true, force: true });
mkdirSync(derivedData, { recursive: true });

let simName = process.argv[2]?.trim();
if (!simName) {
  try {
    simName = execSync(
      `xcrun simctl list devices available | grep -E 'iPhone' | head -1 | sed -E 's/^[[:space:]]*([^(]+).*/\\1/' | xargs`,
      { encoding: "utf8", shell: "/bin/bash" },
    ).trim();
  } catch {
    simName = "";
  }
}
if (!simName) {
  console.log("FAILED: No iPhone Simulator found.");
  process.exit(1);
}

log(`==> Simulator: ${simName}`);
log(`==> DerivedData: ${derivedData}`);
log("==> Resolving packages...");
if (
  run(
    `xcodebuild -project App.xcodeproj -scheme App -derivedDataPath "${derivedData}" -resolvePackageDependencies`,
    iosAppDir,
  ) !== 0
) {
  process.exit(1);
}

log("==> Building (lite) — compile lines should appear below...");
const buildStatus = run(
  `xcodebuild -project App.xcodeproj -scheme App -configuration Debug -derivedDataPath "${derivedData}" -destination "platform=iOS Simulator,name=${simName}" build 2>&1 | tee -a "${logFile}"`,
  iosAppDir,
);

console.log("");
const logText = existsSync(logFile) ? readFileSync(logFile, "utf8") : "";
if (buildStatus === 0 && logText.includes("BUILD SUCCEEDED")) {
  console.log("========================================");
  console.log("  BUILD SUCCEEDED (lite)");
  console.log("========================================");
  console.log("Restoring full native plugins (required before TestFlight)...");
  if (run(`node "${join(root, "scripts/ios-lite-packages.mjs")}" full`) !== 0) process.exit(1);
  console.log("Next: npm run cap:ios → Simulator → Run");
  console.log("For App Store: npm run ios:archive (never archive right after lite without ios:prepare)");
  process.exit(0);
}

console.log("========================================");
console.log("  BUILD FAILED or INCOMPLETE (lite)");
console.log("========================================");
console.log(`Check: ${logFile}`);
process.exit(1);

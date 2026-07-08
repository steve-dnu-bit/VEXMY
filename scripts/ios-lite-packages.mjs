import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageSwift = path.join(root, "ios/App/CapApp-SPM/Package.swift");
const capacitorConfig = path.join(root, "ios/App/App/capacitor.config.json");
const mode = process.argv[2] ?? "lite";

const litePackage = `// swift-tools-version: 5.9
import PackageDescription

// Lite mode: no Stripe Terminal (faster first build for Simulator testing).
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v16)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.4.0"),
        .package(name: "CapacitorApp", path: "../../../node_modules/@capacitor/app"),
        .package(name: "CapacitorSplashScreen", path: "../../../node_modules/@capacitor/splash-screen")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorSplashScreen", package: "CapacitorSplashScreen")
            ]
        )
    ]
)
`;

function patchCapacitorConfig(enableStripe) {
  if (!fs.existsSync(capacitorConfig)) return;
  const json = JSON.parse(fs.readFileSync(capacitorConfig, "utf8"));
  const list = Array.isArray(json.packageClassList) ? json.packageClassList : [];
  const withoutStripe = list.filter((item) => item !== "StripeTerminalPlugin");
  json.packageClassList = enableStripe
    ? [...new Set([...withoutStripe, "StripeTerminalPlugin"])]
    : withoutStripe;
  fs.writeFileSync(capacitorConfig, `${JSON.stringify(json, null, "\t")}\n`);
}

function runNodeScript(relativePath) {
  const script = path.join(root, relativePath);
  const result = spawnSync(process.execPath, [script], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function runCapSyncIos() {
  const result = spawnSync("npx", ["cap", "sync", "ios"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (mode === "full") {
  console.log("[ios-lite-packages] Restoring full iOS native plugins via cap sync...");
  runCapSyncIos();
  runNodeScript("scripts/fix-ios-spm-paths.mjs");
  runNodeScript("scripts/patch-ios-capacitor-config.mjs");
  console.log("[ios-lite-packages] Full CapApp-SPM restored (Camera, Stripe Terminal, Push, etc.).");
} else if (mode === "lite") {
  fs.writeFileSync(packageSwift, litePackage);
  patchCapacitorConfig(false);
  console.log("[ios-lite-packages] Using lite CapApp-SPM (Simulator compile check only — no Stripe/Camera).");
  console.log("[ios-lite-packages] Before TestFlight/App Store: npm run ios:prepare");
} else {
  console.error("Usage: node scripts/ios-lite-packages.mjs [lite|full]");
  process.exit(1);
}

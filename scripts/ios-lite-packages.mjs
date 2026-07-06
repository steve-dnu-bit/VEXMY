import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageSwift = path.join(root, "ios/App/CapApp-SPM/Package.swift");
const capacitorConfig = path.join(root, "ios/App/App/capacitor.config.json");
const mode = process.argv[2] ?? "lite";

const fullPackage = `// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
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
        .package(name: "CapacitorCommunityStripeTerminal", path: "../../../node_modules/@capacitor-community/stripe-terminal"),
        .package(name: "CapacitorApp", path: "../../../node_modules/@capacitor/app"),
        .package(name: "CapacitorSplashScreen", path: "../../../node_modules/@capacitor/splash-screen")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorCommunityStripeTerminal", package: "CapacitorCommunityStripeTerminal"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorSplashScreen", package: "CapacitorSplashScreen")
            ]
        )
    ]
)
`;

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

if (mode === "full") {
  fs.writeFileSync(packageSwift, fullPackage);
  patchCapacitorConfig(true);
  console.log("[ios-lite-packages] Restored full CapApp-SPM (with Stripe Terminal).");
} else if (mode === "lite") {
  fs.writeFileSync(packageSwift, litePackage);
  patchCapacitorConfig(false);
  console.log("[ios-lite-packages] Using lite CapApp-SPM (no Stripe Terminal).");
} else {
  console.error("Usage: node scripts/ios-lite-packages.mjs [lite|full]");
  process.exit(1);
}

/**
 * Fail fast before App Store archive if iOS native plugins were stripped (e.g. ios:build-lite).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "ios/App/App/capacitor.config.json");
const packageSwiftPath = path.join(root, "ios/App/CapApp-SPM/Package.swift");

const REQUIRED_CONFIG_CLASSES = [
  "StripeTerminalPlugin",
  "CAPCameraPlugin",
  "GeolocationPlugin",
  "TapToPayEducationPlugin",
  "TapToPayReadinessPlugin",
  "TerminalPermissionsPlugin",
];

const REQUIRED_SPM_PACKAGES = [
  "CapacitorCommunityStripeTerminal",
  "CapacitorCamera",
  "CapacitorGeolocation",
];

let failed = false;

if (!fs.existsSync(configPath)) {
  console.error("[verify-ios-plugins] Missing capacitor.config.json — run npm run ios:prepare");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const list = config.packageClassList ?? [];
for (const name of REQUIRED_CONFIG_CLASSES) {
  if (!list.includes(name)) {
    console.error(`[verify-ios-plugins] packageClassList missing ${name}`);
    failed = true;
  }
}

if (!fs.existsSync(packageSwiftPath)) {
  console.error("[verify-ios-plugins] Missing CapApp-SPM/Package.swift");
  process.exit(1);
}

const packageSwift = fs.readFileSync(packageSwiftPath, "utf8");
for (const pkg of REQUIRED_SPM_PACKAGES) {
  if (!packageSwift.includes(pkg)) {
    console.error(`[verify-ios-plugins] Package.swift missing ${pkg} (lite build?)`);
    failed = true;
  }
}

if (packageSwift.includes("Lite mode: no Stripe")) {
  console.error("[verify-ios-plugins] Package.swift is in LITE mode — run npm run ios:prepare before archiving");
  failed = true;
}

if (failed) {
  console.error("");
  console.error("Fix: npm run ios:prepare");
  console.error("Never archive after npm run ios:build-lite without running ios:prepare again.");
  process.exit(1);
}

console.log("[verify-ios-plugins] OK — Camera, Stripe Terminal, and custom plugins are registered");

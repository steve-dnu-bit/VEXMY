import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageSwift = path.join(root, "ios/App/CapApp-SPM/Package.swift");

if (!fs.existsSync(packageSwift)) {
  console.log("[fix-ios-spm-paths] Skip — Package.swift not found");
  process.exit(0);
}

const original = fs.readFileSync(packageSwift, "utf8");
const normalized = original.replaceAll("\\\\", "/");

if (normalized !== original) {
  fs.writeFileSync(packageSwift, normalized);
  console.log("[fix-ios-spm-paths] Normalized CapApp-SPM Package.swift paths to forward slashes");
}

const required = [
  "node_modules/@capacitor/app/Package.swift",
  "node_modules/@capacitor/splash-screen/Package.swift",
  "node_modules/@capacitor-community/stripe-terminal/Package.swift",
];

const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length > 0) {
  console.error("[fix-ios-spm-paths] Missing Capacitor iOS plugin packages:");
  for (const file of missing) console.error(`  - ${file}`);
  console.error("Run: npm install");
  process.exit(1);
}

console.log("[fix-ios-spm-paths] OK");

/**
 * Ensure iOS capacitor.config.json registers npm plugins + Velbok custom plugins.
 * Run after `npx cap sync ios` (cap sync overwrites this file).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "ios/App/App/capacitor.config.json");

const REQUIRED_PACKAGE_CLASSES = [
  "StripeTerminalPlugin",
  "AppPlugin",
  "CAPBrowserPlugin",
  "CAPCameraPlugin",
  "GeolocationPlugin",
  "PushNotificationsPlugin",
  "SplashScreenPlugin",
  "TapToPayEducationPlugin",
  "TapToPayReadinessPlugin",
  "TerminalPermissionsPlugin",
];

if (!fs.existsSync(configPath)) {
  console.error("[patch-ios-capacitor-config] Missing ios/App/App/capacitor.config.json — run npm run cap:sync");
  process.exit(1);
}

const json = JSON.parse(fs.readFileSync(configPath, "utf8"));
const list = Array.isArray(json.packageClassList) ? [...json.packageClassList] : [];
let changed = false;

for (const name of REQUIRED_PACKAGE_CLASSES) {
  if (!list.includes(name)) {
    list.push(name);
    changed = true;
  }
}

if (changed) {
  json.packageClassList = list;
  fs.writeFileSync(configPath, `${JSON.stringify(json, null, "\t")}\n`);
  console.log("[patch-ios-capacitor-config] Updated packageClassList:", list.join(", "));
} else {
  console.log("[patch-ios-capacitor-config] OK");
}

/**
 * Verify iOS Firebase / FCM push wiring in the repo (code + Xcode project).
 * Does not check Apple Developer / Firebase Console / Supabase secrets.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDelegate = path.join(root, "ios/App/App/AppDelegate.swift");
const pbxproj = path.join(root, "ios/App/App.xcodeproj/project.pbxproj");
const entitlements = path.join(root, "ios/App/App/App.entitlements");
const infoPlist = path.join(root, "ios/App/App/Info.plist");
const googlePlist = path.join(root, "ios/App/App/GoogleService-Info.plist");

let failed = false;
function ok(msg) {
  console.log(`  OK  ${msg}`);
}
function bad(msg) {
  console.error(`  FAIL ${msg}`);
  failed = true;
}
function warn(msg) {
  console.warn(`  WARN ${msg}`);
}

console.log("[verify-ios-push] Checking repo wiring…\n");

const delegate = fs.readFileSync(appDelegate, "utf8");
if (delegate.includes("FirebaseApp.configure()") && delegate.includes("Messaging.messaging()")) {
  ok("AppDelegate.swift initializes Firebase + FCM token bridge");
} else {
  bad("AppDelegate.swift missing Firebase/FCM setup");
}

const proj = fs.readFileSync(pbxproj, "utf8");
for (const needle of ["firebase-ios-sdk", "FirebaseCore", "FirebaseMessaging", "GoogleService-Info.plist"]) {
  if (proj.includes(needle)) ok(`project.pbxproj references ${needle}`);
  else bad(`project.pbxproj missing ${needle}`);
}

const ents = fs.readFileSync(entitlements, "utf8");
if (ents.includes("aps-environment")) ok("App.entitlements has aps-environment (Push)");
else bad("App.entitlements missing aps-environment");

const info = fs.readFileSync(infoPlist, "utf8");
if (info.includes("remote-notification")) ok("Info.plist has UIBackgroundModes remote-notification");
else bad("Info.plist missing remote-notification background mode");

if (fs.existsSync(googlePlist)) {
  const plist = fs.readFileSync(googlePlist, "utf8");
  if (plist.includes("com.velbok.app") && !plist.includes("YOUR_")) {
    ok("GoogleService-Info.plist present with com.velbok.app");
  } else if (plist.includes("YOUR_")) {
    bad("GoogleService-Info.plist looks like a placeholder — use the real Firebase download");
  } else {
    warn("GoogleService-Info.plist present but BUNDLE_ID check inconclusive");
  }
} else {
  bad("Missing ios/App/App/GoogleService-Info.plist");
  console.error("");
  console.error("  Drop the file from Firebase Console, or:");
  console.error('  node scripts/install-ios-google-services.mjs "C:\\\\path\\\\to\\\\GoogleService-Info.plist"');
}

console.log("");
if (failed) {
  console.error("[verify-ios-push] Incomplete — fix FAIL items above.");
  console.error("");
  console.error("Still only you can do in browsers (I cannot):");
  console.error("  1) Apple Developer → APNs Auth Key (.p8)");
  console.error("  2) Firebase → upload .p8 under Cloud Messaging");
  console.error("  3) Supabase secret FIREBASE_SERVICE_ACCOUNT_JSON (if not set)");
  process.exit(1);
}

console.log("[verify-ios-push] Repo OK.");
console.log("");
console.log("You still must confirm in browsers (cannot be automated here):");
console.log("  1) Apple Developer → Keys → APNs Auth Key exists");
console.log("  2) Firebase → Cloud Messaging → APNs key uploaded for com.velbok.app");
console.log("  3) Supabase → Edge Function secret FIREBASE_SERVICE_ACCOUNT_JSON set");
console.log("  4) Rebuild iOS (TestFlight/Release) on a physical iPhone");

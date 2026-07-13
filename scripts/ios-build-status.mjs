import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const logFile = join(root, "ios-build-simulator.log");

console.log("Velbok iOS build status");
console.log("=======================");
console.log(`Log file: ${logFile}`);
console.log("");

if (!existsSync(logFile)) {
  console.log("Status: NO LOG FILE");
  console.log("The simulator build has not been run with the latest script yet.");
  console.log("Run: npm run ios:build-simulator");
} else {
  const log = readFileSync(logFile, "utf8");
  const lines = log.split(/\r?\n/);
  const tail = lines.slice(-30).join("\n");

  if (log.includes("BUILD SUCCEEDED")) {
    console.log("Status: BUILD SUCCEEDED");
  } else if (log.includes("BUILD FAILED")) {
    console.log("Status: BUILD FAILED");
    console.log("");
    console.log("Last errors:");
    const errors = lines.filter((l) => /error:|fatal error:/i.test(l)).slice(-15);
    console.log(errors.length ? errors.join("\n") : "(no error: lines found — check log tail below)");
  } else {
    console.log("Status: INCOMPLETE OR STILL RUNNING");
    console.log("No BUILD SUCCEEDED / BUILD FAILED in log yet.");
  }

  console.log("");
  console.log("Last 15 log lines:");
  console.log(lines.slice(-15).join("\n") || "(empty)");
}

console.log("");
console.log("Simulator app bundle:");
try {
  const out = execSync(
    'find ~/Library/Developer/Xcode/DerivedData -name "App.app" -path "*Debug-iphonesimulator*" -print -quit 2>/dev/null || true',
    { encoding: "utf8", shell: "/bin/bash" },
  ).trim();
  console.log(out || "Not found yet — build has not completed successfully.");
} catch {
  console.log("Could not search DerivedData (run on macOS).");
}

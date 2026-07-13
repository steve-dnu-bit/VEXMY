import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  return execSync(cmd, { cwd: root, stdio: "inherit", shell: "/bin/bash", ...opts });
}

function tryRun(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: "utf8", shell: "/bin/bash" }).trim();
  } catch {
    return null;
  }
}

console.log("Velbok iOS doctor");
console.log("=================");
console.log(`Time: ${new Date().toISOString()}`);
console.log(`Folder: ${root}`);
console.log(`Node: ${process.version}`);
console.log("");

const checks = [
  ["On macOS", process.platform === "darwin"],
  ["package.json", existsSync(join(root, "package.json"))],
  ["node_modules", existsSync(join(root, "node_modules/@capacitor/app"))],
  ["iOS project", existsSync(join(root, "ios/App/App.xcodeproj/project.pbxproj"))],
  ["Web bundle (public/index.html)", existsSync(join(root, "ios/App/App/public/index.html"))],
  ["xcodebuild", !!tryRun("xcodebuild -version | head -1")],
];

for (const [label, ok] of checks) {
  console.log(`${ok ? "OK" : "MISSING"} — ${label}`);
}

const branch = tryRun("git branch --show-current");
if (branch) console.log(`\nGit branch: ${branch}`);

const sim = tryRun("xcrun simctl list devices available | grep iPhone | head -3");
console.log("\nSimulators:");
console.log(sim || "(none found)");

const xcode = tryRun("xcodebuild -version | head -2");
if (xcode) {
  console.log("\nXcode:");
  console.log(xcode);
}

console.log("\nNext command to try:");
if (!existsSync(join(root, "node_modules/@capacitor/app"))) {
  console.log("  npm install");
} else if (!existsSync(join(root, "ios/App/App/public/index.html"))) {
  console.log("  npm run ios:prepare");
} else {
  console.log("  npm run ios:build-lite");
}

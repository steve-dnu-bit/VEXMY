/**
 * Split the master Velbok logo into mark-only + full wordmark assets,
 * then rebuild all app icons via build-logo-icon.mjs.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const masterArg = process.argv[2];
const BRAND_DIR = join(root, "public/brand");
const DESIGN_DIR = join(root, "design/logo-options");

/** Prefer repo-committed master so Mac/CI builds don't depend on a local Cursor path. */
function resolveMasterPath() {
  if (masterArg) {
    const fromArg = join(root, masterArg);
    if (existsSync(fromArg)) return fromArg;
    throw new Error(`Master logo not found at ${fromArg}`);
  }
  for (const candidate of [
    join(BRAND_DIR, "velbok-logo-master.png"),
    join(root, "public/velbok-logo-source.png"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const MASTER = resolveMasterPath();
const CANVAS = 1024;
const MARK_SCALE = 0.86;
const FULL_SCALE = 0.88;

/** Content bounds (excludes bottom-right sparkle). */
const BOUNDS = { left: 308, top: 14, width: 428, height: 332 };
const MARK_HEIGHT = 268;

function pngOptions() {
  return { compressionLevel: 9, effort: 10, palette: false };
}

/** Punch out near-black pixels so the gold mark sits on a true transparent background. */
async function removeBlackBackground(input, { threshold = 32, soft = 12 } = {}) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue;
    const maxc = Math.max(data[i], data[i + 1], data[i + 2]);
    if (maxc <= threshold) {
      data[i + 3] = 0;
    } else if (maxc < threshold + soft) {
      data[i + 3] = Math.round((a * (maxc - threshold)) / soft);
    }
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png(pngOptions())
    .toBuffer();
}

async function toTransparentSquare(input, { scale, height }) {
  const cropped = await sharp(input)
    .extract({
      left: BOUNDS.left,
      top: BOUNDS.top,
      width: BOUNDS.width,
      height: height ?? BOUNDS.height,
    })
    .png()
    .toBuffer();

  const punched = await removeBlackBackground(cropped);

  const meta = await sharp(punched).metadata();
  const target = Math.max(1, Math.round(CANVAS * scale));
  const ratio = Math.min(target / meta.width, target / meta.height);
  const w = Math.max(1, Math.round(meta.width * ratio));
  const h = Math.max(1, Math.round(meta.height * ratio));

  const resized = await sharp(punched)
    .resize(w, h, {
      fit: "inside",
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, top: Math.round((CANVAS - h) / 2), left: Math.round((CANVAS - w) / 2) }])
    .png(pngOptions())
    .toBuffer();
}

async function onBlackBg(transparentSquare) {
  return sharp(transparentSquare)
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .png(pngOptions())
    .toBuffer();
}

async function write(path, buffer) {
  await sharp(buffer).toFile(path);
  console.log(`Wrote ${path.replace(root + "\\", "").replace(root + "/", "")}`);
}

async function main() {
  if (!MASTER) {
    const existing = join(root, "public/icon-source.png");
    if (existsSync(existing)) {
      console.log("Master logo not found — keeping existing public/icon-source.png");
      return;
    }
    throw new Error(
      "Missing master logo. Add public/brand/velbok-logo-master.png (or pass a path): node scripts/prepare-brand-assets.mjs path/to/logo.png",
    );
  }
  console.log(`Using master logo: ${MASTER.replace(root + "\\", "").replace(root + "/", "")}`);
  mkdirSync(BRAND_DIR, { recursive: true });
  mkdirSync(DESIGN_DIR, { recursive: true });

  const masterDest = join(BRAND_DIR, "velbok-logo-master.png");
  if (MASTER !== masterDest) {
    copyFileSync(MASTER, masterDest);
  }

  const markTransparent = await toTransparentSquare(MASTER, {
    scale: MARK_SCALE,
    height: MARK_HEIGHT,
  });
  const fullTransparent = await toTransparentSquare(MASTER, {
    scale: FULL_SCALE,
    height: BOUNDS.height,
  });

  const markBlack = await onBlackBg(markTransparent);
  const fullBlack = await onBlackBg(fullTransparent);

  await write(join(root, "public/icon-source.png"), markTransparent);
  await write(join(BRAND_DIR, "logo-mark-transparent.png"), markTransparent);
  await write(join(BRAND_DIR, "logo-mark-black.png"), markBlack);
  await write(join(BRAND_DIR, "logo-with-text-transparent.png"), fullTransparent);
  await write(join(BRAND_DIR, "logo-with-text-black.png"), fullBlack);

  await write(join(DESIGN_DIR, "mark-only-transparent.png"), markTransparent);
  await write(join(DESIGN_DIR, "mark-only-black.png"), markBlack);
  await write(join(DESIGN_DIR, "logo-with-text-transparent.png"), fullTransparent);
  await write(join(DESIGN_DIR, "logo-with-text-black.png"), fullBlack);
  await write(join(DESIGN_DIR, "current-logo.png"), markBlack);

  writeFileSync(
    join(DESIGN_DIR, "preview.html"),
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Velbok brand assets</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; background: #111; color: #e8e8e8; padding: 2rem; }
    h1 { margin: 0 0 0.25rem; font-weight: 600; }
    p { color: #999; margin: 0 0 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; }
    .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px; overflow: hidden; }
    .card img { display: block; width: 100%; aspect-ratio: 1; object-fit: contain; }
    .on-black { background: #000; }
    .checker { background: repeating-conic-gradient(#222 0% 25%, #333 0% 50%) 50% / 24px 24px; }
    figcaption { padding: 0.75rem 1rem 1rem; font-size: 0.875rem; line-height: 1.45; }
    strong { color: #b8a06e; display: block; margin-bottom: 0.25rem; }
  </style>
</head>
<body>
  <h1>Velbok brand assets</h1>
  <p>Generated from your new master logo. Mark for icons/app UI; full lockup for marketing.</p>
  <div class="grid">
    <figure class="card"><img class="on-black" src="mark-only-black.png" alt="" /><figcaption><strong>Mark only</strong>Black background. Used for app icons and in-app UI.</figcaption></figure>
    <figure class="card"><img class="checker" src="mark-only-transparent.png" alt="" /><figcaption><strong>Mark only</strong>Transparent background.</figcaption></figure>
    <figure class="card"><img class="on-black" src="logo-with-text-black.png" alt="" /><figcaption><strong>Full logo</strong>Mark + velbok.com on black.</figcaption></figure>
    <figure class="card"><img class="checker" src="logo-with-text-transparent.png" alt="" /><figcaption><strong>Full logo</strong>Mark + velbok.com, transparent.</figcaption></figure>
  </div>
</body>
</html>
`,
  );
  console.log("Wrote design/logo-options/preview.html");
}

await main();

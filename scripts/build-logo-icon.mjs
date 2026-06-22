import sharp from "sharp";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "public/icon-source.png");

const BEIGE = "#b8a06e";
const HOME_BG = { r: 12, g: 12, b: 15, alpha: 1 };
const HOME_BG_HEX = "#0c0c0f";
const RADIUS_RATIO = 0.18;
const APP_MARK_PAD_RATIO = 0.03;
const FRAMED_INSET_RATIO = 0.04;
const HOME_MARK_SCALE = 0.84;
const HOME_MASKABLE_SCALE = 0.68;
const TRIM_THRESHOLD = 12;
/** Android adaptive icon safe zone (~66dp of 108dp). */
const ANDROID_SAFE_RATIO = 0.66;
const ANDROID_LEGACY_SCALE = 0.84;

const ANDROID_MIPMAPS = [
  ["mdpi", 48, 108],
  ["hdpi", 72, 162],
  ["xhdpi", 96, 216],
  ["xxhdpi", 144, 324],
  ["xxxhdpi", 192, 432],
];

function borderWidth(size) {
  return Math.max(1, Math.round((size * 2) / 512));
}

function sharpenSigma(size) {
  if (size >= 256) return 0.85;
  if (size >= 96) return 0.65;
  if (size >= 32) return 0.55;
  return 0.35;
}

async function loadMark() {
  return sharp(source)
    .trim({ threshold: TRIM_THRESHOLD })
    .ensureAlpha()
    .png()
    .toBuffer();
}

async function buildMarkBuffer(targetSize) {
  const sigma = sharpenSigma(targetSize);
  return sharp(await loadMark())
    .resize(targetSize, targetSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .sharpen({ sigma, m1: 0.8, m2: 0.35, x1: 2, y2: 10, y3: 20 })
    .png()
    .toBuffer();
}

function pngOptions() {
  return { compressionLevel: 9, effort: 10, palette: false };
}

function roundedBgSvg(size, { radius, stroke = false } = {}) {
  const r = radius ?? Math.round(size * RADIUS_RATIO);
  const border = stroke ? borderWidth(size) : 0;
  const strokeAttr = stroke
    ? ` stroke="${BEIGE}" stroke-width="${border}"`
    : "";
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="${HOME_BG_HEX}"${strokeAttr}/>
  </svg>`;
}

async function compositeCentered(size, layers) {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(layers)
    .png(pngOptions())
    .toBuffer();
}

/** Transparent mark for in-app UI (sidebar, auth, marketing). */
async function buildAppMark(size) {
  const pad = Math.round(size * APP_MARK_PAD_RATIO);
  const inner = Math.max(1, size - pad * 2);
  const mark = await buildMarkBuffer(inner);
  return compositeCentered(size, [{ input: mark, top: pad, left: pad }]);
}

/** Taskbar / browser tab — mark fills the tile, no thin gold ring (illegible at 16px). */
async function buildFaviconIcon(size) {
  const markScale = size <= 16 ? 0.86 : 0.8;
  const markSize = Math.max(1, Math.round(size * markScale));
  const mark = await buildMarkBuffer(markSize);
  const offset = Math.round((size - markSize) / 2);
  const bg = Buffer.from(roundedBgSvg(size, { radius: Math.round(size * 0.22), stroke: false }));

  return sharp(bg)
    .composite([{ input: mark, top: offset, left: offset }])
    .flatten({ background: HOME_BG })
    .png(pngOptions())
    .toBuffer();
}

/** Larger favicon / PWA with subtle gold frame. */
async function buildFramedIcon(size) {
  const border = borderWidth(size);
  const inset = Math.round(size * FRAMED_INSET_RATIO);
  const markSize = Math.max(1, size - inset * 2 - border);
  const mark = await buildMarkBuffer(markSize);
  const markOffset = Math.round((size - markSize) / 2);
  const frame = Buffer.from(roundedBgSvg(size, { stroke: true }));

  return compositeCentered(size, [
    { input: mark, top: markOffset, left: markOffset },
    { input: frame, top: 0, left: 0 },
  ]);
}

/** Opaque icon for phone home screen / PWA install. */
async function buildHomeScreenIcon(size, { maskable = false } = {}) {
  const markScale = maskable ? HOME_MASKABLE_SCALE : HOME_MARK_SCALE;
  const markSize = Math.max(1, Math.round(size * markScale));
  const markOffset = Math.round((size - markSize) / 2);
  const mark = await buildMarkBuffer(markSize);
  const bgSvg = maskable
    ? `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" fill="${HOME_BG_HEX}"/></svg>`
    : roundedBgSvg(size, { stroke: true });

  return sharp(Buffer.from(bgSvg))
    .composite([{ input: mark, top: markOffset, left: markOffset }])
    .flatten({ background: HOME_BG })
    .png(pngOptions())
    .toBuffer();
}

/** Android adaptive-icon foreground layer (transparent, mark in safe zone). */
async function buildAndroidForeground(size) {
  const markSize = Math.max(1, Math.round(size * ANDROID_SAFE_RATIO));
  const mark = await buildMarkBuffer(markSize);
  const offset = Math.round((size - markSize) / 2);
  return compositeCentered(size, [{ input: mark, top: offset, left: offset }]);
}

/** Legacy Android launcher / round icon (opaque). */
async function buildAndroidLauncher(size) {
  const markSize = Math.max(1, Math.round(size * ANDROID_LEGACY_SCALE));
  const markOffset = Math.round((size - markSize) / 2);
  const mark = await buildMarkBuffer(markSize);
  const bg = Buffer.from(roundedBgSvg(size, { radius: Math.round(size * 0.2), stroke: true }));

  return sharp(bg)
    .composite([{ input: mark, top: markOffset, left: markOffset }])
    .flatten({ background: HOME_BG })
    .png(pngOptions())
    .toBuffer();
}

async function writeIcon(file, buffer) {
  const path = join(root, file);
  mkdirSync(dirname(path), { recursive: true });
  await sharp(buffer).toFile(path);
  console.log(`Wrote ${file}`);
}

if (!existsSync(source)) {
  console.error("Missing public/icon-source.png — run: node scripts/prepare-brand-assets.mjs");
  process.exit(1);
}

const webOutputs = [
  ["public/icons/logo-mark.png", 128, "app"],
  ["public/icons/logo.png", 128, "app"],
  ["public/icons/icon-512-plain.png", 512, "app"],
  ["public/icons/favicon-16.png", 16, "favicon"],
  ["public/icons/favicon-32.png", 32, "favicon"],
  ["public/icons/apple-touch-icon.png", 180, "home"],
  ["public/icons/icon-192.png", 192, "home"],
  ["public/icons/icon-512.png", 512, "home"],
  ["public/icons/icon-1024.png", 1024, "home"],
  ["public/icons/icon-512-maskable.png", 512, "home-maskable"],
  ["public/icons/icon-1024-maskable.png", 1024, "home-maskable"],
];

for (const [file, size, variant] of webOutputs) {
  let buf;
  if (variant === "app") buf = await buildAppMark(size);
  else if (variant === "favicon") buf = await buildFaviconIcon(size);
  else if (variant === "home-maskable") buf = await buildHomeScreenIcon(size, { maskable: true });
  else if (variant === "home") buf = await buildHomeScreenIcon(size, { maskable: false });
  else buf = await buildFramedIcon(size);

  await writeIcon(file, buf);
}

for (const [density, launcherSize, foregroundSize] of ANDROID_MIPMAPS) {
  const dir = `android/app/src/main/res/mipmap-${density}`;
  await writeIcon(`${dir}/ic_launcher_foreground.png`, await buildAndroidForeground(foregroundSize));
  const launcher = await buildAndroidLauncher(launcherSize);
  await writeIcon(`${dir}/ic_launcher.png`, launcher);
  await writeIcon(`${dir}/ic_launcher_round.png`, launcher);
}

const iosIcon = join(root, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png");
copyFileSync(join(root, "public/icons/icon-1024.png"), iosIcon);
console.log("Wrote ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png");

const favicon32 = await buildFaviconIcon(32);
writeFileSync(
  join(root, "public/icon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Velbok app icon">
  <image href="data:image/png;base64,${favicon32.toString("base64")}" width="32" height="32" />
</svg>\n`,
);
console.log("Wrote public/icon.svg");

import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "public/icon-source.png");

const BEIGE = "#b8a06e";
/** Matches site.webmanifest theme_color — opaque home-screen background. */
const HOME_BG = { r: 12, g: 12, b: 15, alpha: 1 };
const HOME_BG_HEX = "#0c0c0f";
const RADIUS_RATIO = 0.18;
/** Tighter crop around the V — less empty margin in every exported icon. */
const APP_MARK_PAD_RATIO = 0.04;
const FRAMED_INSET_RATIO = 0.05;
const HOME_MARK_SCALE = 0.86;
const HOME_MASKABLE_SCALE = 0.66;
const TRIM_THRESHOLD = 12;

function borderWidth(size) {
  return Math.max(1, Math.round((size * 2) / 512));
}

async function loadMark() {
  return sharp(source)
    .trim({ threshold: TRIM_THRESHOLD })
    .ensureAlpha()
    .png()
    .toBuffer();
}

async function buildMarkBuffer(targetSize) {
  const sigma = targetSize >= 256 ? 0.85 : targetSize >= 96 ? 0.65 : 0.45;
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

/** Transparent mark for in-app UI (sidebar, auth, marketing). */
async function buildAppMark(size) {
  const pad = Math.round(size * APP_MARK_PAD_RATIO);
  const inner = Math.max(1, size - pad * 2);

  const mark = await buildMarkBuffer(inner);

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: mark, top: pad, left: pad }])
    .png(pngOptions())
    .toBuffer();
}

/** Transparent mark with thin rounded gold frame — browser favicons only. */
async function buildFramedIcon(size) {
  const border = borderWidth(size);
  const radius = Math.round(size * RADIUS_RATIO);
  const inset = Math.round(size * FRAMED_INSET_RATIO);
  const markSize = Math.max(1, size - inset * 2 - border);

  const mark = await buildMarkBuffer(markSize);

  const frame = Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${border / 2}" y="${border / 2}" width="${size - border}" height="${size - border}" rx="${radius}" ry="${radius}" fill="none" stroke="${BEIGE}" stroke-width="${border}"/>
  </svg>`);

  const markOffset = Math.round((size - markSize) / 2);

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: mark, top: markOffset, left: markOffset },
      { input: frame, top: 0, left: 0 },
    ])
    .png(pngOptions())
    .toBuffer();
}

/**
 * Opaque icon for phone home screen / PWA install.
 * iOS and Android render transparent PNGs with a white matte — always use a solid fill.
 */
async function buildHomeScreenIcon(size, { maskable = false } = {}) {
  const border = borderWidth(size);
  const radius = Math.round(size * RADIUS_RATIO);
  // Maskable: keep artwork inside Android's ~66% safe circle.
  const markScale = maskable ? HOME_MASKABLE_SCALE : HOME_MARK_SCALE;
  const markSize = Math.max(1, Math.round(size * markScale));
  const markOffset = Math.round((size - markSize) / 2);

  const mark = await buildMarkBuffer(markSize);

  const bgSvg = maskable
    ? `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${size}" height="${size}" fill="${HOME_BG_HEX}"/>
      </svg>`
    : `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${HOME_BG_HEX}"/>
        <rect x="${border / 2}" y="${border / 2}" width="${size - border}" height="${size - border}" rx="${radius}" ry="${radius}" fill="none" stroke="${BEIGE}" stroke-width="${border}"/>
      </svg>`;

  return sharp(Buffer.from(bgSvg))
    .composite([{ input: mark, top: markOffset, left: markOffset }])
    .flatten({ background: HOME_BG })
    .png(pngOptions())
    .toBuffer();
}

const outputs = [
  ["public/icons/logo-mark.png", 128, "app"],
  ["public/icons/logo.png", 128, "app"],
  ["public/icons/icon-512-plain.png", 512, "app"],
  ["public/icons/favicon-16.png", 16, "framed"],
  ["public/icons/favicon-32.png", 32, "framed"],
  ["public/icons/apple-touch-icon.png", 180, "home"],
  ["public/icons/icon-192.png", 192, "home"],
  ["public/icons/icon-512.png", 512, "home"],
  ["public/icons/icon-1024.png", 1024, "home"],
  ["public/icons/icon-512-maskable.png", 512, "home-maskable"],
  ["public/icons/icon-1024-maskable.png", 1024, "home-maskable"],
];

for (const [file, size, variant] of outputs) {
  let buf;
  if (variant === "app") buf = await buildAppMark(size);
  else if (variant === "framed") buf = await buildFramedIcon(size);
  else if (variant === "home-maskable") buf = await buildHomeScreenIcon(size, { maskable: true });
  else buf = await buildHomeScreenIcon(size, { maskable: false });

  await sharp(buf).toFile(join(root, file));
  console.log(`Wrote ${file}`);
}

const favicon32 = await buildFramedIcon(32);
const favicon32Base64 = favicon32.toString("base64");

writeFileSync(
  join(root, "public/icon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Velbok app icon">
  <image href="data:image/png;base64,${favicon32Base64}" width="32" height="32" />
</svg>\n`,
);
console.log("Wrote public/icon.svg");

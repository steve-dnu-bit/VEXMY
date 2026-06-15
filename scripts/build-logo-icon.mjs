import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "public/icon-source.png");

const BEIGE = "#b8a06e";
const RADIUS_RATIO = 0.18;

function borderWidth(size) {
  return Math.max(1, Math.round((size * 2) / 512));
}

async function loadMark() {
  return sharp(source).ensureAlpha().png().toBuffer();
}

/** Transparent mark for in-app UI (sidebar, auth, marketing). */
async function buildAppMark(size) {
  const pad = Math.round(size * 0.1);
  const inner = Math.max(1, size - pad * 2);

  const mark = await sharp(await loadMark())
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: mark, top: pad, left: pad }])
    .png()
    .toBuffer();
}

/** Transparent mark with thin rounded gold frame — favicon, PWA install, apple-touch. */
async function buildFramedIcon(size) {
  const border = borderWidth(size);
  const radius = Math.round(size * RADIUS_RATIO);
  const inset = Math.round(size * 0.11);
  const markSize = Math.max(1, size - inset * 2 - border);

  const mark = await sharp(await loadMark())
    .resize(markSize, markSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

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
    .png()
    .toBuffer();
}

const outputs = [
  ["public/icons/logo-mark.png", 128, "app"],
  ["public/icons/logo.png", 128, "app"],
  ["public/icons/icon-512-plain.png", 512, "app"],
  ["public/icons/favicon-16.png", 16, "framed"],
  ["public/icons/favicon-32.png", 32, "framed"],
  ["public/icons/icon-192.png", 192, "framed"],
  ["public/icons/icon-512.png", 512, "framed"],
  ["public/icons/icon-1024.png", 1024, "framed"],
  ["public/icons/apple-touch-icon.png", 180, "framed"],
];

for (const [file, size, variant] of outputs) {
  const buf =
    variant === "app" ? await buildAppMark(size) : await buildFramedIcon(size);
  await sharp(buf).toFile(join(root, file));
  console.log(`Wrote ${file}`);
}

const favicon32 = await buildFramedIcon(32);
const favicon32Base64 = favicon32.toString("base64");

writeFileSync(
  join(root, "public/icon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Velbok app icon">
  <image href="data:image/png;base64,${favicon32Base64}" width="32" height="32" />
</svg>\n`
);
console.log("Wrote public/icon.svg");

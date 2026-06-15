import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "public/icon-source.png");

const BEIGE = "#b8a06e";
const RADIUS_RATIO = 0.18;
const PAD_RATIO = 0.04;

function borderWidth(size) {
  return Math.max(1, Math.round((size * 2) / 512));
}

async function roundedLogo(size, crop) {
  const radius = Math.round(size * RADIUS_RATIO);

  const cropped = await sharp(source)
    .extract(crop)
    .resize(size, size, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  return sharp(cropped)
    .ensureAlpha()
    .composite([
      {
        input: Buffer.from(
          `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="white"/></svg>`
        ),
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();
}

async function buildFaviconIcon(size, crop) {
  const zoom = 0.58;
  const innerSide = Math.round(crop.width * zoom);
  const innerCrop = {
    left: crop.left + Math.round((crop.width - innerSide) / 2),
    top: crop.top + Math.round((crop.height - innerSide) / 2),
    width: innerSide,
    height: innerSide,
  };

  const logoSize = Math.round(size * 0.92);
  const offset = Math.round((size - logoSize) / 2);
  const radius = Math.round(logoSize * RADIUS_RATIO);

  const cropped = await sharp(source)
    .extract(innerCrop)
    .resize(logoSize, logoSize, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  const rounded = await sharp(cropped)
    .ensureAlpha()
    .composite([
      {
        input: Buffer.from(
          `<svg width="${logoSize}" height="${logoSize}"><rect width="${logoSize}" height="${logoSize}" rx="${radius}" fill="white"/></svg>`
        ),
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 11, g: 12, b: 18, alpha: 1 },
    },
  })
    .composite([{ input: rounded, top: offset, left: offset }])
    .png()
    .toBuffer();
}

async function buildSquareIcon(size, crop) {
  return roundedLogo(size, crop);
}

async function buildInstallIcon(size, crop) {
  const border = borderWidth(size);
  const inner = size - border * 2;
  const radius = Math.round(size * RADIUS_RATIO);

  const rounded = await roundedLogo(inner, crop);

  const frame = Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${border / 2}" y="${border / 2}" width="${size - border}" height="${size - border}" rx="${radius}" fill="none" stroke="${BEIGE}" stroke-width="${border}"/>
  </svg>`);

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: rounded, top: border, left: border },
      { input: frame, top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
}

async function detectSourceCrop() {
  const meta = await sharp(source).metadata();
  const side = Math.min(meta.width ?? 0, meta.height ?? 0);
  return { left: 0, top: 0, width: side, height: side };
}

const crop = await detectSourceCrop();
console.log("Icon source crop:", crop);

const testPath = join(root, "public/icons/_test-left-crop.png");
await sharp(source).extract(crop).resize(512, 512, { fit: "cover" }).toFile(testPath);
console.log("Wrote public/icons/_test-left-crop.png");

const outputs = [
  ["public/icons/favicon-16.png", 16, "favicon"],
  ["public/icons/favicon-32.png", 32, "favicon"],
  ["public/icons/logo.png", 128, "plain"],
  ["public/icons/icon-512-plain.png", 512, "plain"],
  ["public/icons/icon-192.png", 192, "install"],
  ["public/icons/icon-512.png", 512, "install"],
  ["public/icons/icon-1024.png", 1024, "install"],
  ["public/icons/apple-touch-icon.png", 180, "install"],
];

for (const [file, size, variant] of outputs) {
  const buf =
    variant === "install"
      ? await buildInstallIcon(size, crop)
      : variant === "favicon"
        ? await buildFaviconIcon(size, crop)
        : await buildSquareIcon(size, crop);
  await sharp(buf).toFile(join(root, file));
  console.log(`Wrote ${file}`);
}

const favicon32 = await buildFaviconIcon(32, crop);
const favicon32Base64 = favicon32.toString("base64");

writeFileSync(
  join(root, "public/icon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Velbok app icon">
  <image href="data:image/png;base64,${favicon32Base64}" width="32" height="32" />
</svg>\n`
);
console.log("Wrote public/icon.svg");

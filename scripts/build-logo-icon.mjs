import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "public/velbok-logo-source.png");

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

async function detectLeftLogoBox() {
  const { data, info } = await sharp(source).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const channels = info.channels;
  const splitX = Math.floor(w / 2);

  let minX = splitX;
  let minY = h;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < splitX; x += 1) {
      const i = (y * w + x) * channels;
      const sum = data[i] + data[i + 1] + data[i + 2];
      if (sum > 90) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const bw = maxX - minX;
  const bh = maxY - minY;
  const side = Math.max(bw, bh);
  const pad = Math.round(side * PAD_RATIO);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const left = Math.max(0, Math.round(cx - side / 2 - pad));
  const top = Math.max(0, Math.round(cy - side / 2 - pad));
  const width = Math.min(w - left, Math.round(side + pad * 2));
  const height = Math.min(h - top, Math.round(side + pad * 2));
  const cropSide = Math.min(width, height);

  return { left, top, width: cropSide, height: cropSide };
}

const crop = await detectLeftLogoBox();
console.log("Left logo crop:", crop);

const testPath = join(root, "public/icons/_test-left-crop.png");
await sharp(source).extract(crop).resize(512, 512, { fit: "cover" }).toFile(testPath);
console.log("Wrote public/icons/_test-left-crop.png");

const outputs = [
  ["public/icons/favicon-32.png", 32, "plain"],
  ["public/icons/logo.png", 128, "plain"],
  ["public/icons/icon-512-plain.png", 512, "plain"],
  ["public/icons/icon-192.png", 192, "install"],
  ["public/icons/icon-512.png", 512, "install"],
  ["public/icons/icon-1024.png", 1024, "install"],
  ["public/icons/apple-touch-icon.png", 180, "install"],
];

for (const [file, size, variant] of outputs) {
  const buf = variant === "install" ? await buildInstallIcon(size, crop) : await buildSquareIcon(size, crop);
  await sharp(buf).toFile(join(root, file));
  console.log(`Wrote ${file}`);
}

writeFileSync(
  join(root, "public/icon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Velbok app icon">
  <image href="/icons/icon-512-plain.png" width="512" height="512" />
</svg>\n`
);
console.log("Wrote public/icon.svg");

/**
 * Generate Google Play Store listing graphics for Velbok.
 * Output: play-store/
 */
import sharp from "sharp";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "play-store");

const BG = "#0c0c0f";
const GOLD = "#b8a06e";
const TEXT = "#f4f4f5";
const MUTED = "#a1a1aa";

const ICON_SRC = join(root, "public/icons/icon-512.png");
const LOGO_MARK = join(root, "public/icons/logo-mark.png");
const LOGO_FULL = join(root, "public/brand/logo-with-text-black.png");
const SHOT_SCHEDULE = join(root, "public/marketing/screenshots/schedule.png");
const SHOT_STENCIL = join(root, "public/marketing/screenshots/stencil.png");

function pngRgb() {
  return { compressionLevel: 6, effort: 7, palette: false };
}

function featureGraphicSvg() {
  // Full-bleed 1024×500 — keep text/logo inside centre safe zone (Play crops edges).
  return `<svg width="1024" height="500" viewBox="0 0 1024 500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1024" y2="500" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0c0c0f"/>
      <stop offset="50%" stop-color="#14141c"/>
      <stop offset="100%" stop-color="#0a0a0d"/>
    </linearGradient>
    <radialGradient id="glow" cx="820" cy="250" r="280" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#b8a06e" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#b8a06e" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="500" fill="url(#bg)"/>
  <rect width="1024" height="500" fill="url(#glow)"/>
  <text x="80" y="200" fill="#b8a06e" font-family="Georgia, 'Times New Roman', serif" font-size="72" font-weight="700">Velbok</text>
  <text x="80" y="262" fill="#f4f4f5" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="600">Tattoo studio management</text>
  <text x="80" y="318" fill="#a1a1aa" font-family="Arial, Helvetica, sans-serif" font-size="22">Schedule · Deposits · Consent · Billing · Tap to Pay</text>
  <text x="80" y="420" fill="#71717a" font-family="Arial, Helvetica, sans-serif" font-size="18">velbok.com</text>
</svg>`;
}

/** Clip app icon to rounded square (alpha in layer only; final export is flattened RGB). */
async function roundedAppIcon(src, size) {
  const radius = Math.round(size * 0.18);
  const resized = await sharp(src)
    .resize(size, size, { fit: "cover", position: "centre", kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();

  const mask = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="white"/>
    </svg>`,
  );

  const ring = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="${size - 2}" height="${size - 2}" rx="${radius}" ry="${radius}"
        fill="none" stroke="#b8a06e" stroke-opacity="0.45" stroke-width="2"/>
    </svg>`,
  );

  const clipped = await sharp(resized)
    .composite([{ input: mask, blend: "dest-in" }])
    .composite([{ input: ring, blend: "over" }])
    .png()
    .toBuffer();

  return clipped;
}

async function buildFeatureGraphic() {
  const fgW = 1024;
  const fgH = 500;
  const pngPath = join(out, "feature-graphic-1024x500.png");
  const jpgPath = join(out, "feature-graphic-1024x500.jpg");
  const jpgAltPath = join(out, "feature-graphic.jpg");

  const base = await sharp(Buffer.from(featureGraphicSvg()))
    .resize(fgW, fgH, { fit: "fill" })
    .flatten({ background: BG })
    .removeAlpha()
    .png()
    .toBuffer();

  const layers = [{ input: base, top: 0, left: 0 }];

  if (existsSync(ICON_SRC)) {
    const iconSize = 224;
    const icon = await roundedAppIcon(ICON_SRC, iconSize);
    layers.push({
      input: icon,
      top: Math.round((fgH - iconSize) / 2),
      left: fgW - iconSize - 80,
    });
  }

  const composed = await sharp({
    create: { width: fgW, height: fgH, channels: 3, background: BG },
  })
    .composite(layers)
    .resize(fgW, fgH, { fit: "fill" })
    .flatten({ background: BG })
    .removeAlpha()
    .toColourspace("srgb");

  // JPEG — most reliable for Play Console upload
  await composed.clone().jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" }).toFile(jpgPath);
  await composed.clone().jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" }).toFile(jpgAltPath);

  // RGB PNG without alpha
  await composed.clone().png(pngRgb()).toFile(pngPath);

  for (const p of [pngPath, jpgPath, jpgAltPath]) {
    const meta = await sharp(p).metadata();
    if (meta.width !== fgW || meta.height !== fgH) {
      throw new Error(`${p} wrong size: ${meta.width}x${meta.height}`);
    }
  }

  const pngMeta = await sharp(pngPath).metadata();
  console.log(`Wrote play-store/feature-graphic-1024x500.png (${pngMeta.width}x${pngMeta.height}, ${pngMeta.channels}ch, alpha=${pngMeta.hasAlpha})`);
  console.log("Wrote play-store/feature-graphic-1024x500.jpg");
  console.log("Wrote play-store/feature-graphic.jpg (short name — try this if upload fails)");
}

function esc(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function png() {
  return pngRgb();
}

function phoneCaptionSvg({ width, height, title, subtitle, titleSize, subtitleSize, titleY, subtitleY }) {
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0c0c0f"/>
      <stop offset="100%" stop-color="#050506"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <text x="${width / 2}" y="${titleY}" text-anchor="middle" fill="${GOLD}" font-family="Segoe UI, system-ui, sans-serif" font-size="${titleSize}" font-weight="700">${esc(title)}</text>
  <text x="${width / 2}" y="${subtitleY}" text-anchor="middle" fill="${MUTED}" font-family="Segoe UI, system-ui, sans-serif" font-size="${subtitleSize}">${esc(subtitle)}</text>
</svg>`;
}

/** Portrait mobile-framed screenshot (phone + tablet listings). */
async function buildMobileScreenshot({ src, outPath, title, subtitle, crop, width = 1080, height = 1920 }) {
  const W = width;
  const H = height;
  const sx = W / 1080;
  const sy = H / 1920;
  const frameTop = Math.round(200 * sy);
  const framePad = Math.round(48 * sx);
  const frameBottom = Math.round(120 * sy);
  const frameW = W - framePad * 2;
  const frameH = H - frameTop - frameBottom;
  const chromePad = Math.round(24 * sx);
  const chromeRx = Math.round(28 * sx);
  const innerRx = Math.round(20 * sx);

  let img = sharp(src);
  if (crop) {
    const meta = await sharp(src).metadata();
    const { left, top, width, height } = crop;
    img = sharp(src).extract({
      left: Math.round(left * meta.width),
      top: Math.round(top * meta.height),
      width: Math.round(width * meta.width),
      height: Math.round(height * meta.height),
    });
  }

  const resized = await img
    .resize(frameW - chromePad, frameH - chromePad, { fit: "inside", kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  const rMeta = await sharp(resized).metadata();
  const frameInnerW = rMeta.width;
  const frameInnerH = rMeta.height;
  const frameX = Math.round((W - frameInnerW - chromePad) / 2);
  const frameY = frameTop + Math.round((frameH - frameInnerH - chromePad) / 2);
  const innerPad = Math.round(12 * sx);

  const chromeSvg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${frameX}" y="${frameY}" width="${frameInnerW + chromePad}" height="${frameInnerH + chromePad}" rx="${chromeRx}" fill="#101216" stroke="${GOLD}" stroke-opacity="0.35" stroke-width="2"/>
    <rect x="${frameX + innerPad}" y="${frameY + innerPad}" width="${frameInnerW}" height="${frameInnerH}" rx="${innerRx}" fill="#090a0f"/>
  </svg>`);

  const base = Buffer.from(
    phoneCaptionSvg({
      width: W,
      height: H,
      title,
      subtitle,
      titleSize: Math.round(34 * sx),
      subtitleSize: Math.round(22 * sx),
      titleY: Math.round(120 * sy),
      subtitleY: Math.round(168 * sy),
    }),
  );

  await sharp(base)
    .composite([
      { input: chromeSvg, top: 0, left: 0 },
      { input: resized, top: frameY + innerPad, left: frameX + innerPad },
    ])
    .png(png())
    .toFile(outPath);
}

const LISTING_COPY = `# Velbok — Google Play Store Listing (en-GB)

## App name
Velbok

## Short description (80 characters max)
Schedule, deposits, consent, billing and Tap to Pay — built for tattoo studios.

## Full description (4000 characters max — copy from play-store/full-description-en-GB.txt)
See play-store/full-description-en-GB.txt (3985 characters).

---

## Upload guide

| Asset | File |
|-------|------|
| App icon (512×512) | play-store/app-icon-512.png |
| Feature graphic (1024×500) | play-store/feature-graphic-1024x500.png (or .jpg if PNG upload fails) |
| Phone screenshots (1080×1920) | play-store/phone/01–04-*.png |
| 7-inch tablet (mobile view, 1200×2133) | play-store/tablet-7-inch/*.png |
| 10-inch tablet (mobile view, 1440×2560) | play-store/tablet-10-inch/*.png |

Video, Chromebook and Android XR: leave blank unless you add them later.
`;

async function main(featureOnly = false) {
  mkdirSync(out, { recursive: true });

  if (!existsSync(ICON_SRC)) throw new Error(`Missing ${ICON_SRC}`);
  if (!featureOnly) copyFileSync(ICON_SRC, join(out, "app-icon-512.png"));

  await buildFeatureGraphic();
  if (featureOnly) return;

  for (const dir of ["phone", "tablet-7-inch", "tablet-10-inch"]) {
    mkdirSync(join(out, dir), { recursive: true });
  }

  const phoneShots = [
    {
      file: "01-schedule.png",
      src: SHOT_SCHEDULE,
      title: "Multi-artist schedule",
      subtitle: "Bookings, deposits and client details in one view",
    },
    {
      file: "02-schedule-calendar.png",
      src: SHOT_SCHEDULE,
      title: "Week and day views",
      subtitle: "Colour-coded services across your whole team",
      crop: { left: 0.28, top: 0, width: 0.72, height: 1 },
    },
    {
      file: "03-stencil.png",
      src: SHOT_STENCIL,
      title: "AI stencil workspace",
      subtitle: "Transfer-ready line art from reference photos",
    },
    {
      file: "04-stencil-compare.png",
      src: SHOT_STENCIL,
      title: "Compare and download",
      subtitle: "Before-and-after slider with print-ready export",
      crop: { left: 0.45, top: 0.05, width: 0.55, height: 0.9 },
    },
  ];

  const outputs = [
    { dir: "phone", width: 1080, height: 1920 },
    { dir: "tablet-7-inch", width: 1200, height: 2133 },
    { dir: "tablet-10-inch", width: 1440, height: 2560 },
  ];

  for (const { dir, width, height } of outputs) {
    for (const shot of phoneShots) {
      if (!existsSync(shot.src)) {
        console.warn(`Skip missing ${shot.src}`);
        continue;
      }
      await buildMobileScreenshot({
        src: shot.src,
        outPath: join(out, dir, shot.file),
        title: shot.title,
        subtitle: shot.subtitle,
        crop: shot.crop,
        width,
        height,
      });
      console.log(`Wrote play-store/${dir}/${shot.file} (${width}x${height})`);
    }
  }

  writeFileSync(join(out, "LISTING-COPY-en-GB.md"), LISTING_COPY);
  console.log("Wrote play-store/LISTING-COPY-en-GB.md");
  console.log("\nDone. Upload files from the play-store/ folder to Google Play Console.");
}

main(process.argv.includes("--feature-only")).catch((err) => {
  console.error(err);
  process.exit(1);
});

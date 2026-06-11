import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svgPath = join(root, "public", "icon.svg");
const fontPath = join(root, "public", "fonts", "inter-semibold.woff2");
const svg = readFileSync(svgPath, "utf8");

const outputs = [
  { file: "public/icons/favicon-32.png", size: 32 },
  { file: "public/icons/icon-192.png", size: 192 },
  { file: "public/icons/icon-512.png", size: 512 },
  { file: "public/icons/icon-1024.png", size: 1024 },
  { file: "public/icons/apple-touch-icon.png", size: 180 },
];

for (const { file, size } of outputs) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    background: "transparent",
    font: {
      fontFiles: [fontPath],
      loadSystemFonts: false,
      defaultFontFamily: "Inter",
    },
  });
  const png = resvg.render().asPng();
  writeFileSync(join(root, file), png);
  console.log(`Wrote ${file} (${size}x${size})`);
}

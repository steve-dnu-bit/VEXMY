import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const PANEL = { x: 28, y: 28, size: 456 };
const PAD = 28;
const OPTICAL_Y = 10;
const VEL_X_OFFSET = -10;
const BOX = PANEL.size - PAD * 2;
const CX = PANEL.x + PANEL.size / 2;
const CY = PANEL.y + PANEL.size / 2;

const ASCENDER = 0.715;
const DESCENDER = 0.05;
const WIDEST_LINE_EM = 1.82;
const LINE_GAP_RATIO = 0.64;
const FONT_COLOR = "#b8a06e";
const BORDER_WIDTH = 2.5;

function metrics(fontSize, letterSpacing) {
  const lineGap = fontSize * LINE_GAP_RATIO;
  const width = fontSize * WIDEST_LINE_EM + letterSpacing * 2;
  const height = fontSize * ASCENDER + lineGap + fontSize * DESCENDER;
  const firstBaselineY = (fontSize * (ASCENDER - DESCENDER - LINE_GAP_RATIO)) / 2;
  const secondBaselineY = firstBaselineY + lineGap;
  return { fontSize, letterSpacing, lineGap, width, height, firstBaselineY, secondBaselineY };
}

function fits(m) {
  return m.width <= BOX && m.height <= BOX;
}

let fontSize = 220;
let letterSpacing = Math.round(fontSize * 0.09);
let layout = metrics(fontSize, letterSpacing);

while (!fits(layout) && fontSize > 120) {
  fontSize -= 2;
  letterSpacing = Math.round(fontSize * 0.09);
  layout = metrics(fontSize, letterSpacing);
}

while (fits(metrics(fontSize + 2, Math.round((fontSize + 2) * 0.09)))) {
  fontSize += 2;
  letterSpacing = Math.round(fontSize * 0.09);
  layout = metrics(fontSize, letterSpacing);
}

const { firstBaselineY, secondBaselineY } = layout;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Velbok app icon">
  <defs>
    <style>
      @font-face {
        font-family: "Inter";
        src: url("fonts/inter-semibold.woff2") format("woff2");
        font-weight: 600;
        font-style: normal;
      }
    </style>
  </defs>

  <rect x="${PANEL.x}" y="${PANEL.y}" width="${PANEL.size}" height="${PANEL.size}" rx="92" fill="#0b0c12" />
  <rect x="${PANEL.x}" y="${PANEL.y}" width="${PANEL.size}" height="${PANEL.size}" rx="92" fill="none" stroke="${FONT_COLOR}" stroke-width="${BORDER_WIDTH}" />

  <g transform="translate(${CX} ${CY + OPTICAL_Y})">
    <text
      x="${VEL_X_OFFSET}"
      y="${firstBaselineY.toFixed(2)}"
      text-anchor="middle"
      font-family="Inter, system-ui, sans-serif"
      font-size="${fontSize}"
      font-weight="600"
      letter-spacing="${letterSpacing}"
      fill="${FONT_COLOR}"
    >
      VEL
    </text>
    <text
      x="0"
      y="${secondBaselineY.toFixed(2)}"
      text-anchor="middle"
      font-family="Inter, system-ui, sans-serif"
      font-size="${fontSize}"
      font-weight="600"
      letter-spacing="${letterSpacing}"
      fill="${FONT_COLOR}"
    >
      BOK
    </text>
  </g>
</svg>
`;

writeFileSync(join(root, "public", "icon.svg"), svg);
console.log(
  `Wrote public/icon.svg (${fontSize}px, tracking ${letterSpacing}, box ${layout.width.toFixed(0)}x${layout.height.toFixed(0)})`
);

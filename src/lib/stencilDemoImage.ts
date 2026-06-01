/** Small reference portrait used for style preview thumbnails. */
export function createStencilDemoDataUrl(size = 320): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const cx = size / 2;
  const cy = size * 0.54;

  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, "#3a3a42");
  bg.addColorStop(1, "#15151a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.translate(cx, cy * 0.72);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#2a2420" : "#1a1614";
    ctx.beginPath();
    ctx.ellipse((i - 3.5) * size * 0.09, 0, size * 0.11, size * 0.22, (i - 3.5) * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const faceGrad = ctx.createRadialGradient(cx - size * 0.08, cy - size * 0.12, size * 0.05, cx, cy, size * 0.34);
  faceGrad.addColorStop(0, "#e8d8c8");
  faceGrad.addColorStop(0.55, "#c9b29a");
  faceGrad.addColorStop(1, "#8a7260");
  ctx.fillStyle = faceGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.27, size * 0.33, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(40, 28, 24, 0.35)";
  ctx.beginPath();
  ctx.ellipse(cx + size * 0.08, cy + size * 0.04, size * 0.16, size * 0.24, 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2d211c";
  ctx.beginPath();
  ctx.ellipse(cx - size * 0.1, cy - size * 0.08, size * 0.05, size * 0.035, -0.2, 0, Math.PI * 2);
  ctx.ellipse(cx + size * 0.1, cy - size * 0.08, size * 0.05, size * 0.035, 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#6a5048";
  ctx.lineWidth = size * 0.012;
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.02);
  ctx.quadraticCurveTo(cx + size * 0.02, cy + size * 0.05, cx, cy + size * 0.1);
  ctx.stroke();

  ctx.strokeStyle = "#8a4038";
  ctx.lineWidth = size * 0.014;
  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.14, size * 0.07, 0.15, Math.PI - 0.15);
  ctx.stroke();

  ctx.fillStyle = "#d8c8bc";
  ctx.beginPath();
  ctx.ellipse(cx - size * 0.24, cy + size * 0.08, size * 0.08, size * 0.05, 0.4, 0, Math.PI * 2);
  ctx.ellipse(cx + size * 0.24, cy + size * 0.08, size * 0.08, size * 0.05, -0.4, 0, Math.PI * 2);
  ctx.fill();

  return canvas.toDataURL("image/jpeg", 0.9);
}

import { fileToDataUrl, loadImage } from "@/lib/stencilImage";

export type LocalStencilSettings = {
  /** 1 = fewer lines, 10 = more fine detail */
  detail: number;
  /** 1 = only bold contours, 100 = pick up subtle lines */
  sensitivity: number;
  /** Gaussian passes before line extraction */
  smoothing: number;
  /** Morphological thicken/thin (-2..3) */
  lineWidth: number;
  /** Speckle + small-blob removal passes */
  cleanup: number;
  /** Tone steps before line work (3–12) */
  posterize: number;
  /** Histogram stretch amount (0–40) */
  contrast: number;
  fillShadows: boolean;
  shadowThreshold: number;
  invert: boolean;
};

export const DEFAULT_STENCIL_SETTINGS: LocalStencilSettings = {
  detail: 6,
  sensitivity: 52,
  smoothing: 1,
  lineWidth: 1,
  cleanup: 2,
  posterize: 6,
  contrast: 14,
  fillShadows: false,
  shadowThreshold: 88,
  invert: false,
};

const MAX_SIDE = 1800;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function makeGaussianKernel(sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const size = radius * 2 + 1;
  const kernel = new Float32Array(size);
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - radius;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }
  for (let i = 0; i < size; i++) kernel[i] /= sum;
  return kernel;
}

function idx(x: number, y: number, width: number) {
  return y * width + x;
}

function sample(src: Float32Array, x: number, y: number, width: number, height: number) {
  const cx = clamp(x, 0, width - 1);
  const cy = clamp(y, 0, height - 1);
  return src[idx(cx, cy, width)];
}

function convolveHorizontal(
  src: Float32Array,
  dst: Float32Array,
  width: number,
  height: number,
  kernel: Float32Array,
) {
  const radius = (kernel.length - 1) >> 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        sum += sample(src, x + k, y, width, height) * kernel[k + radius];
      }
      dst[idx(x, y, width)] = sum;
    }
  }
}

function convolveVertical(
  src: Float32Array,
  dst: Float32Array,
  width: number,
  height: number,
  kernel: Float32Array,
) {
  const radius = (kernel.length - 1) >> 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        sum += sample(src, x, y + k, width, height) * kernel[k + radius];
      }
      dst[idx(x, y, width)] = sum;
    }
  }
}

function gaussianBlur(src: Float32Array, width: number, height: number, sigma: number) {
  const kernel = makeGaussianKernel(sigma);
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  convolveHorizontal(src, tmp, width, height, kernel);
  convolveVertical(tmp, out, width, height, kernel);
  return out;
}

function boxBlur3x3(src: Float32Array, width: number, height: number) {
  const out = new Float32Array(src);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = idx(x, y, width);
      out[i] =
        (src[i - width - 1] +
          src[i - width] +
          src[i - width + 1] +
          src[i - 1] +
          src[i] +
          src[i + 1] +
          src[i + width - 1] +
          src[i + width] +
          src[i + width + 1]) /
        9;
    }
  }
  return out;
}

function posterize(gray: Float32Array, levels: number) {
  const out = new Float32Array(gray.length);
  const steps = Math.max(3, levels);
  for (let i = 0; i < gray.length; i++) {
    const v = clamp(gray[i], 0, 1);
    out[i] = Math.round(v * (steps - 1)) / (steps - 1);
  }
  return out;
}

function normalizeContrast(gray: Float32Array, amount: number) {
  let min = 1;
  let max = 0;
  for (let i = 0; i < gray.length; i++) {
    if (gray[i] < min) min = gray[i];
    if (gray[i] > max) max = gray[i];
  }
  const span = Math.max(0.001, max - min);
  const boost = 1 + amount / 100;
  const out = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    const n = (gray[i] - min) / span;
    out[i] = clamp(0.5 + (n - 0.5) * boost, 0, 1);
  }
  return out;
}

/**
 * Extended Difference of Gaussians (Winnemöller et al.).
 * Flat regions stay white; edges become black ink when the XDoG response drops below 0.5.
 */
function xdogLines(
  gray: Float32Array,
  width: number,
  height: number,
  sigma: number,
  epsilon: number,
  phi: number,
  tau: number,
) {
  const k = 1.6;
  const g1 = gaussianBlur(gray, width, height, sigma);
  const g2 = gaussianBlur(gray, width, height, sigma * k);
  const mask = new Uint8Array(gray.length);

  for (let i = 0; i < gray.length; i++) {
    const dog = g1[i] - g2[i];
    let shade = 1;
    if (dog >= epsilon) {
      shade = 1 + Math.tanh(phi * (dog - tau));
    }
    // Low shade → black line; high shade → white paper.
    mask[i] = shade < 0.55 ? 1 : 0;
  }
  return mask;
}

function gradientMagnitudes(gray: Float32Array, width: number, height: number) {
  const blurred = gaussianBlur(gray, width, height, 1);
  const mag = new Float32Array(gray.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = idx(x, y, width);
      const gx =
        -blurred[i - width - 1] -
        2 * blurred[i - 1] -
        blurred[i + width - 1] +
        blurred[i - width + 1] +
        2 * blurred[i + 1] +
        blurred[i + width + 1];
      const gy =
        -blurred[i - width - 1] -
        2 * blurred[i - width] -
        blurred[i - width + 1] +
        blurred[i + width - 1] +
        2 * blurred[i + width] +
        blurred[i + width + 1];
      mag[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return mag;
}

function percentile(values: Float32Array, p: number) {
  const sorted = Array.from(values).filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 0.1;
  const idx = Math.floor(clamp(p, 0, 1) * (sorted.length - 1));
  return sorted[idx];
}

function cannyLite(gray: Float32Array, width: number, height: number, sensitivity: number) {
  const mag = gradientMagnitudes(gray, width, height);
  const sens = clamp(sensitivity, 1, 100);
  const high = percentile(mag, 0.88 - (sens / 100) * 0.25);
  const low = high * 0.42;
  const strong = new Uint8Array(gray.length);
  const weak = new Uint8Array(gray.length);

  for (let i = 0; i < mag.length; i++) {
    if (mag[i] >= high) strong[i] = 1;
    else if (mag[i] >= low) weak[i] = 1;
  }

  const out = new Uint8Array(strong);
  for (let pass = 0; pass < 2; pass++) {
    const expanded = dilate(out, width, height);
    for (let i = 0; i < out.length; i++) {
      if (!out[i] && weak[i] && expanded[i]) out[i] = 1;
    }
  }
  return out;
}

function invertMask(mask: Uint8Array) {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] ? 0 : 1;
  return out;
}

/** If the mask is mostly ink, polarity was wrong — flip it. */
function ensureLineArtPolarity(mask: Uint8Array) {
  let ink = 0;
  for (let i = 0; i < mask.length; i++) ink += mask[i];
  const ratio = ink / mask.length;
  if (ratio > 0.38) return invertMask(mask);
  return mask;
}

function dilate(mask: Uint8Array, width: number, height: number) {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = idx(x, y, width);
      let on = 0;
      for (let yy = -1; yy <= 1; yy++) {
        for (let xx = -1; xx <= 1; xx++) {
          if (mask[idx(x + xx, y + yy, width)]) {
            on = 1;
            break;
          }
        }
        if (on) break;
      }
      out[i] = on;
    }
  }
  return out;
}

function erode(mask: Uint8Array, width: number, height: number) {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = idx(x, y, width);
      let on = 1;
      for (let yy = -1; yy <= 1; yy++) {
        for (let xx = -1; xx <= 1; xx++) {
          if (!mask[idx(x + xx, y + yy, width)]) {
            on = 0;
            break;
          }
        }
        if (!on) break;
      }
      out[i] = on;
    }
  }
  return out;
}

function removeSpeckles(mask: Uint8Array, width: number, height: number, minNeighbors: number) {
  const out = new Uint8Array(mask);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = idx(x, y, width);
      if (!out[i]) continue;
      let n = 0;
      for (let yy = -1; yy <= 1; yy++) {
        for (let xx = -1; xx <= 1; xx++) {
          if (xx === 0 && yy === 0) continue;
          n += out[idx(x + xx, y + yy, width)] ? 1 : 0;
        }
      }
      if (n < minNeighbors) out[i] = 0;
    }
  }
  return out;
}

function removeSmallBlobs(mask: Uint8Array, width: number, height: number, minArea: number) {
  const visited = new Uint8Array(mask.length);
  const out = new Uint8Array(mask);
  const stack: number[] = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const start = idx(x, y, width);
      if (!mask[start] || visited[start]) continue;

      stack.length = 0;
      stack.push(start);
      visited[start] = 1;
      const pixels: number[] = [start];

      while (stack.length > 0) {
        const i = stack.pop()!;
        const px = i % width;
        const py = (i / width) | 0;
        for (let yy = -1; yy <= 1; yy++) {
          for (let xx = -1; xx <= 1; xx++) {
            const nx = px + xx;
            const ny = py + yy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const ni = idx(nx, ny, width);
            if (!mask[ni] || visited[ni]) continue;
            visited[ni] = 1;
            stack.push(ni);
            pixels.push(ni);
          }
        }
      }

      if (pixels.length < minArea) {
        for (const i of pixels) out[i] = 0;
      }
    }
  }
  return out;
}

function mergeMasks(a: Uint8Array, b: Uint8Array) {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] || b[i] ? 1 : 0;
  return out;
}

export async function generateLocalStencilFromDataUrl(
  dataUrl: string,
  settings: LocalStencilSettings,
): Promise<string> {
  const img = await loadImage(dataUrl);
  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;

  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");

  ctx.drawImage(img, 0, 0, width, height);
  const { data: src } = ctx.getImageData(0, 0, width, height);
  let gray = new Float32Array(width * height);

  for (let i = 0, p = 0; i < src.length; i += 4, p++) {
    gray[p] = (0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]) / 255;
  }

  gray = normalizeContrast(gray, settings.contrast);
  gray = posterize(gray, settings.posterize);

  for (let pass = 0; pass < settings.smoothing; pass++) {
    gray = boxBlur3x3(gray, width, height);
  }

  // detail 1..10 → sigma 2.2..0.9 (more detail = smaller sigma)
  const sigma = 2.2 - (clamp(settings.detail, 1, 10) - 1) * (1.3 / 9);
  const sensitivity = clamp(settings.sensitivity, 1, 100);
  const epsilon = -0.02 + ((100 - sensitivity) / 100) * 0.04;
  const tau = 0.45 + (sensitivity / 100) * 0.25;
  const phi = 10;

  let lines = xdogLines(gray, width, height, sigma, epsilon, phi, tau);
  const canny = cannyLite(gray, width, height, sensitivity);
  lines = mergeMasks(lines, canny);
  lines = ensureLineArtPolarity(lines);

  if (settings.fillShadows) {
    const thresh = settings.shadowThreshold / 255;
    for (let i = 0; i < gray.length; i++) {
      if (gray[i] < thresh) lines[i] = 1;
    }
  }

  const minBlob = 12 + settings.cleanup * 10;
  for (let i = 0; i < settings.cleanup; i++) {
    lines = removeSpeckles(lines, width, height, 2 + i);
    lines = removeSmallBlobs(lines, width, height, minBlob);
  }

  const lw = clamp(settings.lineWidth, -2, 3);
  if (lw > 0) {
    for (let i = 0; i < lw; i++) lines = dilate(lines, width, height);
  } else if (lw < 0) {
    for (let i = 0; i < Math.abs(lw); i++) lines = erode(lines, width, height);
  }

  const out = ctx.createImageData(width, height);
  const dst = out.data;
  for (let i = 0; i < lines.length; i++) {
    const isInk = lines[i] === 1;
    const ink = settings.invert ? (isInk ? 255 : 0) : isInk ? 0 : 255;
    const p = i * 4;
    dst[p] = ink;
    dst[p + 1] = ink;
    dst[p + 2] = ink;
    dst[p + 3] = 255;
  }

  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL("image/png");
}

export async function generateLocalStencil(
  file: File,
  settings: LocalStencilSettings,
  cachedDataUrl?: string | null,
): Promise<string> {
  const dataUrl = await fileToDataUrl(file, cachedDataUrl);
  return generateLocalStencilFromDataUrl(dataUrl, settings);
}

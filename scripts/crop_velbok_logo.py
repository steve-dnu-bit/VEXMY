"""Crop left logo from comparison image and set background to pure black."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(
    r"C:\Users\mrtat\.cursor\projects\c-Users-mrtat-Desktop-velbok-VEXMY\assets"
    r"\c__Users_mrtat_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_"
    r"Gemini_Generated_Image_vy73hqvy73hqvy73-8bb0bd2f-fbf7-4a4d-96db-866b42385587.png"
)
OUT = Path(__file__).resolve().parents[1] / "public" / "icon-source.png"

CANVAS_SIZE = 1024
CONTENT_SCALE = 0.72  # logo occupies ~72% of square — leaves even padding on all sides


def replace_background_with_black(rgb: np.ndarray) -> np.ndarray:
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    max_c = np.maximum(np.maximum(r, g), b).astype(np.float32)
    min_c = np.minimum(np.minimum(r, g), b).astype(np.float32)
    saturation = (max_c - min_c) / (max_c + 1e-6)

    # Dark neutral pixels (charcoal vignette) -> pure black; keep gold logo strokes.
    background = (max_c < 110) & (saturation < 0.35)
    out = rgb.copy()
    out[background] = (0, 0, 0)
    return out


def content_bbox(rgb: np.ndarray, threshold: int = 95) -> tuple[int, int, int, int]:
    mask = np.max(rgb, axis=2) > threshold
    ys, xs = np.where(mask)
    if len(xs) == 0:
        h, w = rgb.shape[:2]
        return 0, 0, w, h
    pad = 2
    x0 = max(int(xs.min()) - pad, 0)
    y0 = max(int(ys.min()) - pad, 0)
    x1 = min(int(xs.max()) + pad + 1, rgb.shape[1])
    y1 = min(int(ys.max()) + pad + 1, rgb.shape[0])
    return x0, y0, x1, y1


def to_square_canvas(rgb: np.ndarray, size: int = CANVAS_SIZE, scale: float = CONTENT_SCALE) -> np.ndarray:
    x0, y0, x1, y1 = content_bbox(rgb)
    content = rgb[y0:y1, x0:x1]
    ch, cw = content.shape[:2]

    target = max(1, int(round(size * scale)))
    ratio = min(target / cw, target / ch)
    new_w = max(1, int(round(cw * ratio)))
    new_h = max(1, int(round(ch * ratio)))

    content_img = Image.fromarray(content).resize((new_w, new_h), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (size, size), (0, 0, 0))
    offset_x = (size - new_w) // 2
    offset_y = (size - new_h) // 2
    canvas.paste(content_img, (offset_x, offset_y))
    return np.array(canvas)


def save_square_source(rgb: np.ndarray) -> None:
    square = to_square_canvas(rgb)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(square).save(OUT, optimize=True)
    print(f"Saved {OUT} ({square.shape[1]}x{square.shape[0]})")


def crop_from_comparison() -> np.ndarray:
    img = Image.open(SRC).convert("RGB")
    w, h = img.size
    arr = np.array(img)

    # Left panel only (Option 2 logo).
    left = arr[:, : w // 2]
    content_mask = np.max(left, axis=2) > 95

    # Drop option/label text above the V mark.
    row_counts = content_mask.sum(axis=1)
    y0 = int(h * 0.28)
    quiet_end = 0
    for y in range(90, min(220, left.shape[0])):
        if row_counts[y] == 0:
            quiet_end = y
        elif quiet_end >= 125 and row_counts[y] > 30:
            y0 = quiet_end + 1
            break

    full_ys, full_xs = np.where(content_mask)
    logo_ys = full_ys[full_ys >= y0]
    logo_xs = full_xs[full_ys >= y0]
    y1 = min(int(logo_ys.max()) + 24, left.shape[0])
    x0 = max(int(logo_xs.min()) - 20, 0)
    x1 = min(int(logo_xs.max()) + 20, left.shape[1])

    cropped = left[y0:y1, x0:x1]
    return replace_background_with_black(cropped)


def main() -> None:
    if OUT.exists() and not SRC.exists():
        cleaned = replace_background_with_black(np.array(Image.open(OUT).convert("RGB")))
    elif SRC.exists():
        cleaned = crop_from_comparison()
    else:
        raise SystemExit(f"Neither source image nor {OUT} found")

    save_square_source(cleaned)


if __name__ == "__main__":
    main()

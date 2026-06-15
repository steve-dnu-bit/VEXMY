"""Prepare Velbok mark-only icon source on a transparent square canvas."""
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
CONTENT_SCALE = 0.68


def replace_background_transparent(rgb: np.ndarray) -> np.ndarray:
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    max_c = np.maximum(np.maximum(r, g), b).astype(np.float32)
    min_c = np.minimum(np.minimum(r, g), b).astype(np.float32)
    saturation = (max_c - min_c) / (max_c + 1e-6)
    background = (max_c < 110) & (saturation < 0.35)
    alpha = np.where(background, 0, 255).astype(np.uint8)
    return np.dstack([rgb, alpha])


def content_bbox_alpha(rgba: np.ndarray, threshold: int = 24) -> tuple[int, int, int, int]:
    alpha = rgba[:, :, 3]
    mask = alpha > threshold
    ys, xs = np.where(mask)
    if len(xs) == 0:
        h, w = rgba.shape[:2]
        return 0, 0, w, h
    pad = 2
    x0 = max(int(xs.min()) - pad, 0)
    y0 = max(int(ys.min()) - pad, 0)
    x1 = min(int(xs.max()) + pad + 1, rgba.shape[1])
    y1 = min(int(ys.max()) + pad + 1, rgba.shape[0])
    return x0, y0, x1, y1


def split_mark_from_wordmark(rgba: np.ndarray) -> np.ndarray:
    alpha = rgba[:, :, 3]
    mask = alpha > 24
    row_counts = mask.sum(axis=1)
    h = rgba.shape[0]

    mark_bottom = h
    quiet_row = 0
    for y in range(int(h * 0.35), h):
        xs = np.where(mask[y])[0]
        span = (xs.max() - xs.min()) if len(xs) else 0
        if row_counts[y] < 25:
            quiet_row = y
        elif quiet_row > h * 0.55 and span > 350:
            mark_bottom = quiet_row + 1
            break

    x0, y0, x1, y1 = content_bbox_alpha(rgba)
    return rgba[y0:mark_bottom, x0:x1]


def to_square_canvas(rgba: np.ndarray, size: int = CANVAS_SIZE, scale: float = CONTENT_SCALE) -> np.ndarray:
    x0, y0, x1, y1 = content_bbox_alpha(rgba)
    content = rgba[y0:y1, x0:x1]
    ch, cw = content.shape[:2]

    target = max(1, int(round(size * scale)))
    ratio = min(target / cw, target / ch)
    new_w = max(1, int(round(cw * ratio)))
    new_h = max(1, int(round(ch * ratio)))

    content_img = Image.fromarray(content).resize((new_w, new_h), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    offset_x = (size - new_w) // 2
    offset_y = (size - new_h) // 2
    canvas.paste(content_img, (offset_x, offset_y), content_img)
    return np.array(canvas)


def crop_from_comparison() -> np.ndarray:
    img = Image.open(SRC).convert("RGB")
    w, h = img.size
    arr = np.array(img)
    left = arr[:, : w // 2]
    content_mask = np.max(left, axis=2) > 95

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
    rgba = replace_background_transparent(cropped)
    return split_mark_from_wordmark(rgba)


def prepare_from_existing(path: Path) -> np.ndarray:
    img = Image.open(path).convert("RGBA")
    rgba = np.array(img)
    if rgba.shape[2] == 3:
        rgba = replace_background_transparent(rgba[:, :, :3])
    else:
        rgb = rgba[:, :, :3]
        alpha = rgba[:, :, 3]
        bg = (np.max(rgb, axis=2) < 110) & (alpha > 0)
        rgba = rgba.copy()
        rgba[bg, 3] = 0
    return split_mark_from_wordmark(rgba)


def main() -> None:
    if SRC.exists():
        mark = crop_from_comparison()
    elif OUT.exists():
        mark = prepare_from_existing(OUT)
    else:
        raise SystemExit(f"Neither source image nor {OUT} found")

    square = to_square_canvas(mark)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(square).save(OUT, optimize=True)
    print(f"Saved mark-only transparent {OUT} ({square.shape[1]}x{square.shape[0]})")


if __name__ == "__main__":
    main()

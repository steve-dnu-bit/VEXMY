"""Generate slight variations of the existing Velbok mark from icon-source.png."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "icon-source.png"
OUT_DIR = ROOT / "design" / "logo-options"
SIZE = 512
GOLD = np.array([184, 160, 110], dtype=np.uint8)  # #b8a06e
WARM_GOLD = np.array([198, 172, 118], dtype=np.uint8)
COOL_GOLD = np.array([176, 154, 108], dtype=np.uint8)
BLACK = (0, 0, 0, 255)


def load_rgba(path: Path) -> np.ndarray:
    return np.array(Image.open(path).convert("RGBA"))


def to_black_canvas(rgba: np.ndarray, size: int = SIZE, scale: float = 0.88) -> Image.Image:
    alpha = rgba[:, :, 3]
    ys, xs = np.where(alpha > 24)
    if len(xs) == 0:
        return Image.new("RGBA", (size, size), BLACK)
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    crop = rgba[y0:y1, x0:x1]
    ch, cw = crop.shape[:2]
    target = max(1, int(round(size * scale)))
    ratio = min(target / cw, target / ch)
    new_w = max(1, int(round(cw * ratio)))
    new_h = max(1, int(round(ch * ratio)))
    resized = Image.fromarray(crop).resize((new_w, new_h), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ox = (size - new_w) // 2
    oy = (size - new_h) // 2
    canvas.paste(resized, (ox, oy), resized)
    flat = Image.new("RGBA", (size, size), BLACK)
    flat.alpha_composite(canvas)
    return flat


def recolor_gold(rgba: np.ndarray, rgb: np.ndarray) -> np.ndarray:
    out = rgba.copy()
    mask = out[:, :, 3] > 24
    out[mask, 0] = rgb[0]
    out[mask, 1] = rgb[1]
    out[mask, 2] = rgb[2]
    return out


def trim_lower_spray(rgba: np.ndarray) -> np.ndarray:
    """Remove the halftone fan below the V while keeping the full mark."""
    alpha = rgba[:, :, 3]
    ys, xs = np.where(alpha > 24)
    if len(xs) == 0:
        return rgba

    y0, y1 = int(ys.min()), int(ys.max())
    x0, x1 = int(xs.min()), int(xs.max())
    cx = (x0 + x1) // 2
    height = y1 - y0
    cut = y0 + int(height * 0.68)
    content_half = (x1 - x0) / 2
    tip_half = max(16, int(height * 0.18))

    out = rgba.copy()
    for y in range(cut, out.shape[0]):
        t = (y - cut) / max(1, y1 - cut)
        allowed = tip_half + t * (content_half * 0.42)
        row = out[y, :, 3] > 24
        xs_row = np.where(row)[0]
        if len(xs_row) == 0:
            continue
        for x in xs_row:
            if abs(x - cx) > allowed:
                out[y, x, 3] = 0

    return out


def remove_halftone_dots(rgba: np.ndarray, keep_components: int = 3, min_area: int = 220) -> np.ndarray:
    """Keep the largest mark shapes; drop halftone specks."""
    try:
        from scipy import ndimage
    except ImportError:
        return rgba

    alpha = rgba[:, :, 3]
    mask = alpha > 24
    mask = ndimage.binary_opening(mask, structure=np.ones((5, 5), dtype=bool))
    labeled, count = ndimage.label(mask)
    if count == 0:
        return rgba

    sizes = [(label_id, int((labeled == label_id).sum())) for label_id in range(1, count + 1)]
    sizes.sort(key=lambda item: item[1], reverse=True)
    keep_labels = {label_id for label_id, area in sizes[:keep_components] if area >= min_area}
    if not keep_labels:
        keep_labels = {sizes[0][0]}

    out = rgba.copy()
    drop = mask & ~np.isin(labeled, list(keep_labels))
    out[drop, 3] = 0
    return out


def sharpen(img: Image.Image) -> Image.Image:
    return img.filter(ImageFilter.UnsharpMask(radius=1.2, percent=140, threshold=2))


def add_circle_frame(img: Image.Image, stroke: int = 5) -> Image.Image:
    size = img.size[0]
    framed = img.copy()
    draw = ImageDraw.Draw(framed)
    pad = stroke + 8
    draw.ellipse((pad, pad, size - pad - 1, size - pad - 1), outline=(*GOLD[:3], 255), width=stroke)
    return framed


def save_variant(name: str, img: Image.Image) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{name}.png"
    img.save(path, optimize=True)
    print(f"Wrote {path.relative_to(ROOT)}")


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Missing {SOURCE}")

    base_rgba = load_rgba(SOURCE)

    # 1 — Cleaned original (same colors, sharpened)
    v1 = sharpen(to_black_canvas(base_rgba, scale=0.88))
    save_variant("variation-1-cleaned", v1)

    # 2 — Flat gold (single brand color, keeps dots)
    v2 = to_black_canvas(recolor_gold(base_rgba, GOLD), scale=0.88)
    save_variant("variation-2-flat-gold", v2)

    # 3 — No halftone dots (original gradient colors)
    v3 = to_black_canvas(trim_lower_spray(remove_halftone_dots(base_rgba)), scale=0.88)
    save_variant("variation-3-no-dots", sharpen(v3))

    # 4 — Flat gold, no dots (cleanest flat mark)
    v4 = to_black_canvas(trim_lower_spray(remove_halftone_dots(recolor_gold(base_rgba, GOLD))), scale=0.88)
    save_variant("variation-4-flat-no-dots", v4)

    # 5 — Circle frame (flat gold, no dots)
    v5 = add_circle_frame(v4.copy())
    save_variant("variation-5-framed", v5)

    # 6 — Larger mark + warmer flat gold
    v6 = to_black_canvas(trim_lower_spray(remove_halftone_dots(recolor_gold(base_rgba, WARM_GOLD))), scale=0.96)
    save_variant("variation-6-larger-warm", sharpen(v6))

    # Update comparison reference
    save_variant("current-logo", v1)


if __name__ == "__main__":
    main()

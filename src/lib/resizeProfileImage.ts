/** Target sizes for profile / portal theme uploads — keeps storage and portal loads fast.
 *  Stencil generator images are handled separately and are not resized here. */
const AVATAR_PX = 512;
const PORTAL_BG_MAX_WIDTH = 1280;
const PORTAL_BG_MAX_HEIGHT = 720;
const AVATAR_JPEG_QUALITY = 0.85;
const PORTAL_BG_JPEG_QUALITY = 0.7;

export type ProfileImageKind = "avatar" | "portalBackground";

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image file"));
    };
    img.src = url;
  });
}

function canvasToJpegFile(canvas: HTMLCanvasElement, fileName: string, quality: number): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not encode image"));
          return;
        }
        resolve(new File([blob], fileName, { type: "image/jpeg" }));
      },
      "image/jpeg",
      quality,
    );
  });
}

function drawAvatar(ctx: CanvasRenderingContext2D, img: HTMLImageElement, size: number) {
  const crop = Math.min(img.width, img.height);
  const sx = (img.width - crop) / 2;
  const sy = (img.height - crop) / 2;
  ctx.drawImage(img, sx, sy, crop, crop, 0, 0, size, size);
}

function portalBackgroundDimensions(img: HTMLImageElement): { width: number; height: number } {
  const scale = Math.min(PORTAL_BG_MAX_WIDTH / img.width, PORTAL_BG_MAX_HEIGHT / img.height, 1);
  return {
    width: Math.max(1, Math.round(img.width * scale)),
    height: Math.max(1, Math.round(img.height * scale)),
  };
}

/**
 * Resize and re-encode artist/staff profile images before upload.
 * Avatars: square center crop at 512×512.
 * Portal backgrounds: fit within 1280×720 at stronger JPEG compression.
 * Does not affect stencil generator uploads.
 */
export async function resizeProfileImageForUpload(file: File, kind: ProfileImageKind): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("File must be an image");
  }

  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image");

  let quality = AVATAR_JPEG_QUALITY;
  if (kind === "avatar") {
    canvas.width = AVATAR_PX;
    canvas.height = AVATAR_PX;
    drawAvatar(ctx, img, AVATAR_PX);
  } else {
    const { width, height } = portalBackgroundDimensions(img);
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);
    quality = PORTAL_BG_JPEG_QUALITY;
  }

  const stem = file.name.replace(/\.[^.]+$/, "").trim() || "image";
  return canvasToJpegFile(canvas, `${stem}.jpg`, quality);
}

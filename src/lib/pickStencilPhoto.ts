import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { isNativeApp } from "@/lib/platform";

export type PickedStencilPhoto = {
  file: File;
  dataUrl: string;
};

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function ensurePhotoLibraryPermission(): Promise<void> {
  const status = await Camera.checkPermissions();
  if (status.photos === "granted" || status.photos === "limited") return;

  const requested = await Camera.requestPermissions({ permissions: ["photos"] });
  if (requested.photos !== "granted" && requested.photos !== "limited") {
    throw new Error(
      "Photo library access is required. Open iPhone Settings → Velbok → Photos → All Photos, then try again.",
    );
  }
}

/** Pick a reference photo via the native gallery (reliable on Capacitor Android/iOS). */
export async function pickStencilPhotoFromDevice(): Promise<PickedStencilPhoto> {
  if (!isNativeApp()) {
    throw new Error("Native photo picker is only available in the mobile app.");
  }

  if (!Capacitor.isPluginAvailable("Camera")) {
    throw new Error(
      "Camera plugin is missing from this iOS build. On your Mac run npm run ios:prepare, then create a new Xcode archive — do not upload a build made after ios:build-lite.",
    );
  }

  await ensurePhotoLibraryPermission();

  // DataUrl avoids Capacitor.convertFileSrc + fetch, which often fails on iOS WebView.
  const photo = await Camera.getPhoto({
    quality: 90,
    source: CameraSource.Photos,
    resultType: CameraResultType.DataUrl,
    allowEditing: false,
  });

  if (!photo.dataUrl) {
    throw new Error("Failed to read image");
  }

  const blob = dataUrlToBlob(photo.dataUrl);
  if (blob.size <= 0) throw new Error("Failed to read image");

  const format = photo.format?.toLowerCase() || "jpeg";
  const mime = blob.type || (format === "png" ? "image/png" : "image/jpeg");
  const file = new File([blob], `stencil-ref.${format === "png" ? "png" : "jpg"}`, { type: mime });

  return { file, dataUrl: photo.dataUrl };
}

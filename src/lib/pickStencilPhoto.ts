import { Camera, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { isNativeApp } from "@/lib/platform";

export type PickedStencilPhoto = {
  file: File;
  dataUrl: string;
};

/** Pick a reference photo via the native gallery (reliable on Capacitor Android/iOS). */
export async function pickStencilPhotoFromDevice(): Promise<PickedStencilPhoto> {
  if (!isNativeApp()) {
    throw new Error("Native photo picker is only available in the mobile app.");
  }

  const result = await Camera.pickImages({
    quality: 90,
    limit: 1,
    source: CameraSource.Photos,
  });

  const photo = result.photos[0];
  if (!photo?.webPath) throw new Error("Failed to read image");

  const fetchUrl = Capacitor.convertFileSrc(photo.webPath);
  const response = await fetch(fetchUrl);
  if (!response.ok) throw new Error("Failed to read image");

  const blob = await response.blob();
  if (blob.size <= 0) throw new Error("Failed to read image");

  const format = photo.format?.toLowerCase() || "jpeg";
  const mime = blob.type || (format === "png" ? "image/png" : "image/jpeg");
  const file = new File([blob], `stencil-ref.${format === "png" ? "png" : "jpg"}`, { type: mime });

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = reader.result;
      if (typeof value === "string" && value.startsWith("data:")) resolve(value);
      else reject(new Error("Failed to read image"));
    };
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });

  return { file, dataUrl };
}

import { registerPlugin } from "@capacitor/core";
import { isNativeApp, nativePlatform } from "@/lib/platform";

export interface TapToPayEducationPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  showHowToTap(): Promise<void>;
  sfSymbolPng(options: {
    name?: string;
    pointSize?: number;
  }): Promise<{ name: string; pngBase64: string; width: number; height: number }>;
}

export const TapToPayEducation = registerPlugin<TapToPayEducationPlugin>("TapToPayEducation", {
  web: {
    isAvailable: async () => ({ available: false }),
    showHowToTap: async () => {
      throw new Error("Tap to Pay education is only available in the Velbok iOS app");
    },
    sfSymbolPng: async () => {
      throw new Error("SF Symbols are only available in the Velbok iOS app");
    },
  },
});

/** Present Apple How to Tap. Returns false only when unavailable; throws on present failure. */
export async function showTapToPayEducationIfAvailable(): Promise<boolean> {
  if (!isNativeApp() || nativePlatform() !== "ios") return false;
  const { available } = await TapToPayEducation.isAvailable();
  if (!available) return false;
  await TapToPayEducation.showHowToTap();
  return true;
}

const symbolCache = new Map<string, string>();

/** Official SF Symbol as data URL for WebView buttons (Apple req 5.5). */
export async function loadTapToPaySfSymbolDataUrl(
  name: "wave.3.right.circle" | "wave.3.right.circle.fill" = "wave.3.right.circle.fill",
  pointSize = 22,
): Promise<string | null> {
  if (!isNativeApp() || nativePlatform() !== "ios") return null;
  const key = `${name}:${pointSize}`;
  const cached = symbolCache.get(key);
  if (cached) return cached;
  try {
    const result = await TapToPayEducation.sfSymbolPng({ name, pointSize });
    const url = `data:image/png;base64,${result.pngBase64}`;
    symbolCache.set(key, url);
    return url;
  } catch {
    return null;
  }
}

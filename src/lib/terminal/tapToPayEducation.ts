import { registerPlugin } from "@capacitor/core";

export interface TapToPayEducationPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  showHowToTap(): Promise<void>;
}

export const TapToPayEducation = registerPlugin<TapToPayEducationPlugin>("TapToPayEducation", {
  web: {
    isAvailable: async () => ({ available: false }),
    showHowToTap: async () => {
      throw new Error("Tap to Pay education is only available in the Velbok iOS app");
    },
  },
});

export async function showTapToPayEducationIfAvailable(): Promise<boolean> {
  try {
    const { available } = await TapToPayEducation.isAvailable();
    if (!available) return false;
    await TapToPayEducation.showHowToTap();
    return true;
  } catch {
    return false;
  }
}

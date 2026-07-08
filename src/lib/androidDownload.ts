/** Google Play internal testing opt-in URL. Copy fresh link from Play Console → Internal testing → Testers. */
export const PLAY_ANDROID_BETA_URL =
  import.meta.env.VITE_PLAY_ANDROID_BETA_URL?.trim() ||
  "https://play.google.com/apps/internaltest/4701744591257923713";

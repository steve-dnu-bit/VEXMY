/** Shared tap target / alignment box for both store badges. */
export const STORE_BADGE_BOX_CLASS =
  "inline-flex h-12 w-[148px] shrink-0 items-center justify-center overflow-hidden sm:h-14 sm:w-[170px]";

/**
 * Google Play PNG includes generous transparent padding around the artwork.
 * Scale up so the visible badge matches the App Store badge beside it.
 */
export const GOOGLE_PLAY_BADGE_IMG_CLASS =
  "h-full w-full origin-center scale-[1.28] object-contain object-center";

/**
 * Apple badge artwork fills more of its asset — scale down for visual parity.
 */
export const APP_STORE_BADGE_IMG_CLASS =
  "h-full w-full origin-center scale-[0.86] object-contain object-center";

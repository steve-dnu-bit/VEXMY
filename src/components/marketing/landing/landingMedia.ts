export const LANDING_MEDIA = {
  schedule: {
    video: "/marketing/videos/schedule.mp4",
    poster: "/marketing/screenshots/schedule.png",
    title: "velbok.com/schedule",
    altKey: "landing.screenshotScheduleAlt",
  },
  stencil: {
    video: "/marketing/videos/stencil.mp4",
    poster: "/marketing/screenshots/stencil-poster.jpg",
    title: "velbok.com/stencil",
    altKey: "landing.screenshotStencilAlt",
  },
} as const;

/** Short loop for the landing hero — style picker through comparison slider. */
export const LANDING_HERO_VIDEO = {
  src: "/marketing/videos/stencil-hero.mp4",
  poster: "/marketing/screenshots/stencil-poster.jpg",
  title: "velbok.com/stencil",
  altKey: "landing.screenshotStencilAlt",
} as const;

export type LandingMediaId = keyof typeof LANDING_MEDIA;

export const LANDING_MEDIA_IDS: LandingMediaId[] = ["schedule", "stencil"];

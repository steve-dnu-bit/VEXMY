export const LANDING_MEDIA = {
  schedule: {
    poster: "/marketing/screenshots/schedule.png",
    title: "velbok.com/schedule",
    altKey: "landing.screenshotScheduleAlt",
  },
  stencil: {
    poster: "/marketing/screenshots/stencil.png",
    video: "/marketing/videos/stencil.mp4",
    title: "velbok.com/stencil",
    altKey: "landing.screenshotStencilAlt",
  },
} as const;

export type LandingMediaId = keyof typeof LANDING_MEDIA;

export const LANDING_CAROUSEL_IDS: LandingMediaId[] = ["schedule", "stencil"];

export const LANDING_STENCIL_VIDEO = LANDING_MEDIA.stencil.video;

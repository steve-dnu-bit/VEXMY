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

export const LANDING_HERO_SLIDE_COPY: Record<
  LandingMediaId,
  { tabKey: string; titleKey: string; bodyKey: string; pointKeys: [string, string, string] }
> = {
  schedule: {
    tabKey: "landing.heroShowcaseScheduleTab",
    titleKey: "landing.heroShowcaseScheduleTitle",
    bodyKey: "landing.heroShowcaseScheduleBody",
    pointKeys: [
      "landing.heroShowcaseSchedulePoint1",
      "landing.heroShowcaseSchedulePoint2",
      "landing.heroShowcaseSchedulePoint3",
    ],
  },
  stencil: {
    tabKey: "landing.heroShowcaseStencilTab",
    titleKey: "landing.heroShowcaseStencilTitle",
    bodyKey: "landing.heroShowcaseStencilBody",
    pointKeys: [
      "landing.heroShowcaseStencilPoint1",
      "landing.heroShowcaseStencilPoint2",
      "landing.heroShowcaseStencilPoint3",
    ],
  },
};

export const LANDING_STENCIL_VIDEO = LANDING_MEDIA.stencil.video;

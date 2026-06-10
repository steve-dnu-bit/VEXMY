import { useTranslation } from "react-i18next";
import { Calendar, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import LandingVideoFrame from "./LandingVideoFrame";
import { LANDING_MEDIA, LANDING_MEDIA_IDS, type LandingMediaId } from "./landingMedia";

const GALLERY_META: Record<LandingMediaId, { icon: typeof Calendar; titleKey: string; bodyKey: string }> = {
  schedule: { icon: Calendar, titleKey: "landing.screenScheduleTitle", bodyKey: "landing.screenScheduleBody" },
  stencil: { icon: Sparkles, titleKey: "landing.screenStencilTitle", bodyKey: "landing.screenStencilBody" },
};

const LandingScreenshotGallery = () => {
  const { t } = useTranslation();

  return (
    <section id="screenshots" className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">{t("landing.screensTitle")}</h2>
          <p className="mt-4 text-muted-foreground">{t("landing.screensSubtitle")}</p>
        </div>

        <div className="mt-14 space-y-16">
          {LANDING_MEDIA_IDS.map((id, i) => {
            const { icon: Icon, titleKey, bodyKey } = GALLERY_META[id];
            const media = LANDING_MEDIA[id];
            const flip = i % 2 === 1;

            return (
              <article key={id} className="group grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
                <div className={cn(flip && "lg:order-2")}>
                  <div className="mb-3 inline-flex rounded-lg bg-gold/10 p-2 text-gold">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-display text-xl font-semibold sm:text-2xl">{t(titleKey)}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{t(bodyKey)}</p>
                </div>
                <div
                  className={cn(
                    "transition-transform duration-500 group-hover:scale-[1.01]",
                    flip && "lg:order-1",
                  )}
                >
                  <LandingVideoFrame
                    src={media.video}
                    poster={media.poster}
                    alt={t(media.altKey)}
                    title={media.title}
                    loop
                  />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default LandingScreenshotGallery;

import { useCallback, useState, useRef } from "react";
import { Pause, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import LandingVideoFrame from "./LandingVideoFrame";
import { LANDING_MEDIA, LANDING_MEDIA_IDS, type LandingMediaId } from "./landingMedia";

const TOUR_CAPTION_KEYS: Record<LandingMediaId, { title: string; body: string }> = {
  schedule: { title: "landing.tourScheduleTitle", body: "landing.tourScheduleBody" },
  stencil: { title: "landing.tourStencilTitle", body: "landing.tourStencilBody" },
};

const LandingFeatureTour = () => {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const advanceLock = useRef(false);

  const mediaId = LANDING_MEDIA_IDS[index];
  const media = LANDING_MEDIA[mediaId];
  const caption = TOUR_CAPTION_KEYS[mediaId];

  const goTo = useCallback((next: number) => {
    setIndex((next + LANDING_MEDIA_IDS.length) % LANDING_MEDIA_IDS.length);
    setProgress(0);
    advanceLock.current = false;
  }, []);

  const handleClipEnded = useCallback(() => {
    if (!playing || advanceLock.current) return;
    advanceLock.current = true;
    goTo(index + 1);
  }, [playing, index, goTo]);

  return (
    <section id="product-tour" className="border-t border-gold/10 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-gold/80">{t("landing.tourBadge")}</p>
          <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">{t("landing.tourTitle")}</h2>
          <p className="mt-4 text-muted-foreground">{t("landing.tourSubtitle")}</p>
        </div>

        <div className="relative mx-auto mt-12 max-w-5xl">
          <div className="relative overflow-hidden rounded-2xl border border-gold/20 bg-[#08090e]/90 p-1 shadow-[0_32px_100px_rgba(0,0,0,0.55)]">
            <div key={mediaId} className="animate-in fade-in-0 zoom-in-95 duration-700">
              <LandingVideoFrame
                src={media.video}
                poster={media.poster}
                alt={t(media.altKey)}
                title={media.title}
                playing={playing}
                loop={false}
                onEnded={handleClipEnded}
                onTimeUpdate={setProgress}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-h-[4.5rem]">
              <h3 className="font-display text-xl font-semibold">{t(caption.title)}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t(caption.body)}</p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0 border-gold/30"
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? t("landing.tourPause") : t("landing.tourPlay")}
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <div className="flex gap-2">
                {LANDING_MEDIA_IDS.map((id, i) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => goTo(i)}
                    className={cn(
                      "relative h-2 w-10 overflow-hidden rounded-full bg-border/60 transition-colors",
                      i === index && "bg-gold/25",
                    )}
                    aria-label={t(TOUR_CAPTION_KEYS[id].title)}
                  >
                    {i === index ? (
                      <span
                        className="absolute inset-y-0 left-0 bg-gold transition-[width] duration-100 ease-linear"
                        style={{ width: `${Math.min(100, progress * 100)}%` }}
                      />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LandingFeatureTour;

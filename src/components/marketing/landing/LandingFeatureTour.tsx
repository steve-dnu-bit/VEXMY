import { useCallback, useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConsentMock, DepositsMock, ScheduleMock } from "./LandingAppMocks";
import LandingVideoFrame from "./LandingVideoFrame";
import { LANDING_MEDIA } from "./landingMedia";

const SLIDE_MS = 4500;

type SlideId = "schedule" | "deposits" | "stencil" | "consent";

const SLIDES: SlideId[] = ["schedule", "deposits", "stencil", "consent"];

function StencilVideoSlide() {
  const { t } = useTranslation();
  const media = LANDING_MEDIA.stencil;
  return (
    <LandingVideoFrame
      src={media.video}
      poster={media.poster}
      alt={t(media.altKey)}
      title={media.title}
      loop
    />
  );
}

function SlideFrame({ id }: { id: SlideId }) {
  switch (id) {
    case "schedule":
      return <ScheduleMock />;
    case "deposits":
      return <DepositsMock />;
    case "stencil":
      return <StencilVideoSlide />;
    case "consent":
      return <ConsentMock />;
  }
}

const LandingFeatureTour = () => {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);

  const slideId = SLIDES[index];

  const goTo = useCallback((next: number) => {
    setIndex((next + SLIDES.length) % SLIDES.length);
    setProgress(0);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const tick = 50;
    const timer = window.setInterval(() => {
      setProgress((p) => {
        const next = p + tick / SLIDE_MS;
        if (next >= 1) {
          goTo(index + 1);
          return 0;
        }
        return next;
      });
    }, tick);
    return () => window.clearInterval(timer);
  }, [playing, index, goTo]);

  const captions: Record<SlideId, { title: string; body: string }> = {
    schedule: { title: t("landing.tourScheduleTitle"), body: t("landing.tourScheduleBody") },
    deposits: { title: t("landing.tourDepositsTitle"), body: t("landing.tourDepositsBody") },
    stencil: { title: t("landing.tourStencilTitle"), body: t("landing.tourStencilBody") },
    consent: { title: t("landing.tourConsentTitle"), body: t("landing.tourConsentBody") },
  };

  return (
    <section id="product-tour" className="border-t border-gold/10 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-gold/80">{t("landing.tourBadge")}</p>
          <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">{t("landing.tourTitle")}</h2>
          <p className="mt-4 text-muted-foreground">{t("landing.tourSubtitle")}</p>
        </div>

        <div className="relative mx-auto mt-12 max-w-4xl">
          <div className="relative overflow-hidden rounded-2xl border border-gold/20 bg-[#08090e]/90 p-1 shadow-[0_32px_100px_rgba(0,0,0,0.55)]">
            <div key={slideId} className="animate-in fade-in-0 zoom-in-95 duration-700">
              <SlideFrame id={slideId} />
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#08090e] to-transparent" />
          </div>

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-h-[4.5rem]">
              <h3 className="font-display text-xl font-semibold">{captions[slideId].title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{captions[slideId].body}</p>
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
                {SLIDES.map((id, i) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setIndex(i);
                      setProgress(0);
                    }}
                    className={cn(
                      "relative h-2 w-10 overflow-hidden rounded-full bg-border/60 transition-colors",
                      i === index && "bg-gold/25",
                    )}
                    aria-label={captions[id].title}
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

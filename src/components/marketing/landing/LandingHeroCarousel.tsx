import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import LandingScreenshotFrame from "./LandingScreenshotFrame";
import { LANDING_CAROUSEL_IDS, LANDING_MEDIA } from "./landingMedia";

const SLIDE_MS = 5000;

const LandingHeroCarousel = () => {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  const slideId = LANDING_CAROUSEL_IDS[index];
  const slide = LANDING_MEDIA[slideId];

  const goTo = useCallback((next: number) => {
    setIndex((next + LANDING_CAROUSEL_IDS.length) % LANDING_CAROUSEL_IDS.length);
    setProgress(0);
  }, []);

  useEffect(() => {
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
  }, [index, goTo]);

  return (
    <div>
      <div key={slideId} className="animate-in fade-in-0 duration-500">
        <LandingScreenshotFrame
          src={slide.poster}
          alt={t(slide.altKey)}
          title={slide.title}
          priority={index === 0}
        />
      </div>
      <div className="mt-4 flex justify-center gap-2">
        {LANDING_CAROUSEL_IDS.map((id, i) => (
          <button
            key={id}
            type="button"
            onClick={() => goTo(i)}
            className={cn(
              "relative h-2 w-10 overflow-hidden rounded-full bg-border/60 transition-colors",
              i === index && "bg-gold/25",
            )}
            aria-label={t(LANDING_MEDIA[id].altKey)}
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
  );
};

export default LandingHeroCarousel;

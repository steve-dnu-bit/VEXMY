import { useCallback, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import LandingScreenshotFrame from "./LandingScreenshotFrame";
import {
  LANDING_CAROUSEL_IDS,
  LANDING_HERO_SLIDE_COPY,
  LANDING_MEDIA,
  type LandingMediaId,
} from "./landingMedia";

const SLIDE_MS = 6000;

const LandingHeroCarousel = () => {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  const slideId = LANDING_CAROUSEL_IDS[index];
  const slide = LANDING_MEDIA[slideId];
  const copy = LANDING_HERO_SLIDE_COPY[slideId];

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
    <article className="grid items-center gap-8 rounded-2xl border border-gold/20 bg-[#101216]/70 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[0.2em] text-gold/80">{t("landing.heroShowcaseBadge")}</p>
        <h2 className="mt-2 font-display text-2xl font-bold leading-tight sm:text-3xl">
          {t("landing.heroShowcaseTitle")}
        </h2>
        <div key={slideId} className="mt-5 animate-in fade-in-0 duration-500">
          <h3 className="font-display text-lg font-semibold text-gold sm:text-xl">{t(copy.titleKey)}</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{t(copy.bodyKey)}</p>
          <ul className="mt-4 space-y-2">
            {copy.pointKeys.map((key) => (
              <li key={key} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-6 flex gap-2">
          {LANDING_CAROUSEL_IDS.map((id, i) => (
            <SlideTab
              key={id}
              id={id}
              active={i === index}
              progress={i === index ? progress : 0}
              onSelect={() => goTo(i)}
            />
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-sm lg:max-w-md lg:justify-self-end">
        <div key={slideId} className="animate-in fade-in-0 duration-500">
          <LandingScreenshotFrame
            src={slide.poster}
            alt={t(slide.altKey)}
            title={slide.title}
            priority={index === 0}
            compact
          />
        </div>
      </div>
    </article>
  );
};

function SlideTab({
  id,
  active,
  progress,
  onSelect,
}: {
  id: LandingMediaId;
  active: boolean;
  progress: number;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const label = t(LANDING_HERO_SLIDE_COPY[id].tabKey);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative overflow-hidden rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-gold/20 text-gold" : "bg-border/50 text-muted-foreground hover:bg-border/70",
      )}
      aria-label={label}
      aria-current={active ? "true" : undefined}
    >
      <span className="relative z-10">{label}</span>
      {active ? (
        <span
          className="absolute inset-y-0 left-0 bg-gold/25 transition-[width] duration-100 ease-linear"
          style={{ width: `${Math.min(100, progress * 100)}%` }}
        />
      ) : null}
    </button>
  );
}

export default LandingHeroCarousel;

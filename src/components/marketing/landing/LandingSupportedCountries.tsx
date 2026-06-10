import { useTranslation } from "react-i18next";
import { SHOP_COUNTRIES } from "@/lib/shopCurrency";
import { cn } from "@/lib/utils";

const FLAG_ITEMS = SHOP_COUNTRIES.map((country) => ({
  code: country.code,
  label: country.label,
  iso: country.stripeCountry.toLowerCase(),
}));

const LandingSupportedCountries = () => {
  const { t } = useTranslation();
  const marqueeItems = [...FLAG_ITEMS, ...FLAG_ITEMS];

  return (
    <section id="regions" className="border-t border-gold/10 px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-4xl text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-gold/70">{t("landing.regionsTitle")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("landing.regionsSubtitle")}</p>
      </div>

      <div
        className="relative mx-auto mt-8 max-w-5xl overflow-hidden py-2 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]"
        aria-label={t("landing.regionsCarouselLabel")}
      >
        <div className="flex w-max animate-flag-marquee items-center gap-6 px-4 hover:[animation-play-state:paused] motion-reduce:animate-none">
          {marqueeItems.map((country, i) => (
            <div
              key={`${country.code}-${i}`}
              className={cn(
                "flex shrink-0 flex-col items-center gap-2",
                "animate-flag-float motion-reduce:animate-none",
              )}
              style={{ animationDelay: `${(i % FLAG_ITEMS.length) * 0.35}s` }}
              title={country.label}
            >
              <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-gold/25 bg-card/40 shadow-[0_8px_24px_rgba(0,0,0,0.35)] ring-1 ring-white/5 sm:h-14 sm:w-14">
                <img
                  src={`https://flagcdn.com/w80/${country.iso}.png`}
                  srcSet={`https://flagcdn.com/w80/${country.iso}.png 1x, https://flagcdn.com/w160/${country.iso}.png 2x`}
                  alt=""
                  width={56}
                  height={56}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/90">
                {country.code}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default LandingSupportedCountries;

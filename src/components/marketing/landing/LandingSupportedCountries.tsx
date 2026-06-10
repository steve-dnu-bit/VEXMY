import { useTranslation } from "react-i18next";
import { SHOP_COUNTRIES } from "@/lib/shopCurrency";

const COUNTRY_FLAG: Record<string, string> = {
  UK: "🇬🇧",
  US: "🇺🇸",
  CA: "🇨🇦",
  AU: "🇦🇺",
  DE: "🇩🇪",
  FR: "🇫🇷",
  RO: "🇷🇴",
  IT: "🇮🇹",
  ES: "🇪🇸",
  SE: "🇸🇪",
  NO: "🇳🇴",
  NL: "🇳🇱",
  BG: "🇧🇬",
};

const FLAG_ITEMS = SHOP_COUNTRIES.map((country) => ({
  code: country.code,
  label: country.label,
  flag: COUNTRY_FLAG[country.code] ?? "🌍",
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
        className="relative mx-auto mt-8 max-w-5xl overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]"
        aria-label={t("landing.regionsCarouselLabel")}
      >
        <div className="flex w-max animate-flag-marquee items-center gap-8 px-4 hover:[animation-play-state:paused] motion-reduce:animate-none motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-4">
          {marqueeItems.map((country, i) => (
            <div
              key={`${country.code}-${i}`}
              className="flex shrink-0 flex-col items-center gap-1.5"
              title={country.label}
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full border border-border/40 bg-card/30 text-2xl sm:h-14 sm:w-14 sm:text-3xl"
                aria-hidden
              >
                {country.flag}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
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

import { useTranslation } from "react-i18next";
import { maxDepositAmountForCurrency } from "@/lib/depositLimits";
import { formatShopMoney, SHOP_COUNTRIES } from "@/lib/shopCurrency";

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

const LandingSupportedCountries = () => {
  const { t } = useTranslation();
  const currencies = [...new Set(SHOP_COUNTRIES.map((c) => c.currency))];

  return (
    <section id="regions" className="border-t border-gold/10 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">{t("landing.regionsTitle")}</h2>
          <p className="mt-4 text-muted-foreground">{t("landing.regionsSubtitle")}</p>
        </div>

        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {SHOP_COUNTRIES.map((country) => (
            <div
              key={country.code}
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/45 px-4 py-3 transition-colors hover:border-gold/30"
            >
              <span className="text-2xl" aria-hidden>
                {COUNTRY_FLAG[country.code] ?? "🌍"}
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium">{country.label}</p>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {country.currency.toUpperCase()} · {t("landing.regionsPayments")}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {currencies.map((currency) => (
            <span
              key={currency}
              className="rounded-full border border-gold/20 bg-gold/5 px-3 py-1 text-xs font-medium uppercase tracking-wide text-gold"
            >
              {currency} · {t("landing.regionsDepositCap", {
                amount: formatShopMoney(maxDepositAmountForCurrency(currency), currency),
              })}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};

export default LandingSupportedCountries;

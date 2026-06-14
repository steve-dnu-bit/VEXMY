import { useEffect, useState } from "react";
import { currencyForShopCountry, type ShopCurrencyCode } from "@/lib/shopCurrency";
import { detectShopCountryFromIp } from "@/lib/detectShopCountry";
import { loadOrgBillingContext } from "@/lib/orgBilling";

/**
 * Currency for marketing/subscribe pricing: org billing profile when logged in,
 * otherwise visitor geo, otherwise GBP.
 */
export function usePricingCurrency(): ShopCurrencyCode {
  const [currency, setCurrency] = useState<ShopCurrencyCode>("gbp");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const org = await loadOrgBillingContext();
        if (!cancelled && org.currency) {
          setCurrency(org.currency);
          return;
        }
      } catch {
        // not signed in or RPC unavailable
      }
      const geo = await detectShopCountryFromIp();
      if (!cancelled && geo) {
        setCurrency(currencyForShopCountry(geo.shopCountry));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return currency;
}

import Stripe from "npm:stripe@16.12.0";

export const PLATFORM_PLAN_IDS = ["starter", "studio", "enterprise"] as const;
export type PlatformPlanId = (typeof PLATFORM_PLAN_IDS)[number];

const SECRET_BY_PLAN: Record<PlatformPlanId, string> = {
  starter: "STRIPE_PRICE_STARTER",
  studio: "STRIPE_PRICE_STUDIO",
  enterprise: "STRIPE_PRICE_ENTERPRISE",
};

export function getPlatformPriceSecret(planId: PlatformPlanId): string | null {
  return Deno.env.get(SECRET_BY_PLAN[planId]) ?? null;
}

export function formatPriceSecretError(priceId: string, planId: PlatformPlanId): string | null {
  if (priceId.startsWith("prod_")) {
    return `${SECRET_BY_PLAN[planId]} is a product ID (${priceId}). Open Stripe → Products → ${planId} plan → Pricing and copy the Price ID (price_...).`;
  }
  if (!priceId.startsWith("price_")) {
    return `${SECRET_BY_PLAN[planId]} must be price_..., got "${priceId.slice(0, 16)}...".`;
  }
  return null;
}

export type PlatformPriceCheck = {
  planId: PlatformPlanId;
  secretName: string;
  configured: boolean;
  idPrefix: string | null;
  ok: boolean;
  error: string | null;
  recurring: boolean | null;
  amount: string | null;
  currency: string | null;
};

export async function checkPlatformPrice(
  stripe: Stripe,
  planId: PlatformPlanId,
): Promise<PlatformPriceCheck> {
  const secretName = SECRET_BY_PLAN[planId];
  const priceId = getPlatformPriceSecret(planId);

  if (!priceId) {
    return {
      planId,
      secretName,
      configured: false,
      idPrefix: null,
      ok: false,
      error: `${secretName} is not set in Supabase Edge Function secrets.`,
      recurring: null,
      amount: null,
      currency: null,
    };
  }

  const formatError = formatPriceSecretError(priceId, planId);
  if (formatError) {
    return {
      planId,
      secretName,
      configured: true,
      idPrefix: priceId.slice(0, 12),
      ok: false,
      error: formatError,
      recurring: null,
      amount: null,
      currency: null,
    };
  }

  try {
    const price = await stripe.prices.retrieve(priceId);
    if (!price.recurring) {
      return {
        planId,
        secretName,
        configured: true,
        idPrefix: priceId.slice(0, 12),
        ok: false,
        error: `${secretName} must be a recurring subscription price (monthly/yearly), not a one-time price.`,
        recurring: false,
        amount: null,
        currency: price.currency ?? null,
      };
    }

    const amount = price.unit_amount != null
      ? `${(price.unit_amount / 100).toFixed(2)} ${price.currency?.toUpperCase()}`
      : null;

    return {
      planId,
      secretName,
      configured: true,
      idPrefix: priceId.slice(0, 12),
      ok: true,
      error: null,
      recurring: true,
      amount,
      currency: price.currency ?? null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown Stripe error";
    const friendly = msg.includes("No such price")
      ? `${secretName} (${priceId.slice(0, 12)}...) not found in this Stripe account/mode. Use test price IDs with sk_test_... and live with sk_live_....`
      : `${secretName}: ${msg}`;
    return {
      planId,
      secretName,
      configured: true,
      idPrefix: priceId.slice(0, 12),
      ok: false,
      error: friendly,
      recurring: null,
      amount: null,
      currency: null,
    };
  }
}

export async function checkAllPlatformPrices(stripe: Stripe): Promise<PlatformPriceCheck[]> {
  const results: PlatformPriceCheck[] = [];
  for (const planId of PLATFORM_PLAN_IDS) {
    results.push(await checkPlatformPrice(stripe, planId));
  }
  return results;
}

export function stripeKeyMode(secretKey: string): "test" | "live" | "unknown" {
  if (secretKey.startsWith("sk_test_")) return "test";
  if (secretKey.startsWith("sk_live_")) return "live";
  return "unknown";
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@16.12.0";
import { platformPriceSecretName, type PlatformPlanId } from "../_shared/stripe-platform-billing.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PLAN_IDS = ["solo", "starter", "studio", "enterprise"] as const;

/** Monthly amounts in smallest currency unit (pence, cents, öre, etc.). */
const PLAN_AMOUNTS: Record<string, Record<(typeof PLAN_IDS)[number], number>> = {
  gbp: { solo: 995, starter: 1495, studio: 1995, enterprise: 4995 },
  eur: { solo: 1195, starter: 1795, studio: 2395, enterprise: 5995 },
  usd: { solo: 1295, starter: 1895, studio: 2495, enterprise: 6295 },
  aud: { solo: 1595, starter: 2295, studio: 2995, enterprise: 7495 },
  cad: { solo: 1395, starter: 2095, studio: 2795, enterprise: 6995 },
  sek: { solo: 12900, starter: 19900, studio: 26500, enterprise: 64900 },
  nok: { solo: 12900, starter: 19900, studio: 26500, enterprise: 64900 },
  ron: { solo: 5695, starter: 8495, studio: 11295, enterprise: 27995 },
  bgn: { solo: 2395, starter: 3495, studio: 4695, enterprise: 11695 },
};

const PLAN_NAMES: Record<(typeof PLAN_IDS)[number], string> = {
  solo: "Velbok Solo",
  starter: "Velbok Starter",
  studio: "Velbok Studio",
  enterprise: "Velbok Enterprise",
};

const SUPPORTED_CURRENCIES = Object.keys(PLAN_AMOUNTS).filter((c) => c !== "bgn");

function parseBearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization");
  const m = h ? /^Bearer\s+(.+)$/i.exec(h.trim()) : null;
  return m ? m[1].trim() : null;
}

function isServiceRoleToken(token: string, serviceKey: string): boolean {
  if (token === serviceKey) return true;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

async function ensureProduct(stripe: Stripe, planId: string, name: string): Promise<Stripe.Product> {
  const search = await stripe.products.search({
    query: `metadata['velbok_plan_id']:'${planId}'`,
    limit: 1,
  });
  if (search.data[0]) return search.data[0];
  return stripe.products.create({
    name,
    metadata: { velbok_plan_id: planId },
  });
}

async function ensurePlanPrice(
  stripe: Stripe,
  productId: string,
  planId: string,
  currency: string,
  amount: number,
): Promise<{ planId: string; currency: string; priceId: string; amount: number; created: boolean }> {
  const cur = currency.toLowerCase();
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  let price = prices.data.find(
    (p) =>
      p.currency === cur &&
      p.unit_amount === amount &&
      p.recurring?.interval === "month",
  );

  let created = false;
  if (!price) {
    price = await stripe.prices.create({
      product: productId,
      currency: cur,
      unit_amount: amount,
      recurring: { interval: "month" },
      metadata: { velbok_plan_id: planId, velbok_currency: cur },
    });
    created = true;
  }

  return {
    planId,
    currency: cur,
    priceId: price.id,
    amount: price.unit_amount ?? amount,
    created,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    if (!supabaseUrl || !serviceKey || !stripeSecret) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = parseBearer(req);
    if (!token || !isServiceRoleToken(token, serviceKey)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const currenciesFilter = Array.isArray(body.currencies)
      ? (body.currencies as string[]).map((c) => c.toLowerCase())
      : SUPPORTED_CURRENCIES;

    const stripe = new Stripe(stripeSecret);
    const admin = createClient(supabaseUrl, serviceKey);

    const products: Record<string, string> = {};
    for (const planId of PLAN_IDS) {
      const product = await ensureProduct(stripe, planId, PLAN_NAMES[planId]);
      products[planId] = product.id;
    }

    const results: Array<{
      planId: string;
      currency: string;
      priceId: string;
      amount: number;
      created: boolean;
    }> = [];
    const errors: Array<{ currency: string; planId?: string; error: string }> = [];

    const secrets: Record<string, string> = {};

    for (const currency of currenciesFilter) {
      const amounts = PLAN_AMOUNTS[currency];
      if (!amounts) continue;

      for (const planId of PLAN_IDS) {
        try {
          const row = await ensurePlanPrice(
            stripe,
            products[planId],
            planId,
            currency,
            amounts[planId],
          );
          results.push(row);

          const secretName = platformPriceSecretName(planId as PlatformPlanId, currency);
          secrets[secretName] = row.priceId;

          const { error: dbErr } = await admin.from("subscription_plan_prices").upsert(
            {
              plan_id: planId,
              currency,
              amount_monthly: row.amount / 100,
              stripe_price_id: row.priceId,
            },
            { onConflict: "plan_id,currency" },
          );
          if (dbErr) {
            errors.push({ currency, planId, error: dbErr.message });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push({ currency, planId, error: msg });
        }
      }
    }

    if (results.length === 0) {
      return new Response(JSON.stringify({ error: "No prices created", errors }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        stripeMode: stripeSecret.startsWith("sk_test_") ? "test" : "live",
        currencies: [...new Set(results.map((r) => r.currency))],
        plans: results,
        secrets,
        errors: errors.length ? errors : undefined,
        skippedNote: "BGN is omitted — Stripe no longer supports new BGN prices; Bulgarian studios use EUR for platform checkout.",
        nextStep:
          "Run scripts/setup-stripe-platform-prices.ps1 to push secrets to Supabase, or set them manually in Dashboard → Edge Functions → Secrets.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

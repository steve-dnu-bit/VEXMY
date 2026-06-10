import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "npm:stripe@16.12.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PLANS = [
  { id: "starter", name: "Velbok Starter", amount: 1495 },
  { id: "studio", name: "Velbok Studio", amount: 1995 },
  { id: "enterprise", name: "Velbok Enterprise", amount: 2990 },
] as const;

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

async function ensurePlanPrice(
  stripe: Stripe,
  plan: (typeof PLANS)[number],
): Promise<{ planId: string; priceId: string; productId: string; created: boolean }> {
  const search = await stripe.products.search({
    query: `metadata['velbok_plan_id']:'${plan.id}'`,
    limit: 1,
  });

  let product = search.data[0];
  let createdProduct = false;
  if (!product) {
    product = await stripe.products.create({
      name: plan.name,
      metadata: { velbok_plan_id: plan.id },
    });
    createdProduct = true;
  }

  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  let price = prices.data.find(
    (p) =>
      p.currency === "gbp" &&
      p.unit_amount === plan.amount &&
      p.recurring?.interval === "month",
  );

  let createdPrice = false;
  if (!price) {
    price = await stripe.prices.create({
      product: product.id,
      currency: "gbp",
      unit_amount: plan.amount,
      recurring: { interval: "month" },
      metadata: { velbok_plan_id: plan.id },
    });
    createdPrice = true;
  }

  return {
    planId: plan.id,
    priceId: price.id,
    productId: product.id,
    created: createdProduct || createdPrice,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    if (!serviceKey || !stripeSecret) {
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

    const stripe = new Stripe(stripeSecret);
    const results = [];
    for (const plan of PLANS) {
      results.push(await ensurePlanPrice(stripe, plan));
    }

    const secrets = {
      STRIPE_PRICE_STARTER: results.find((r) => r.planId === "starter")!.priceId,
      STRIPE_PRICE_STUDIO: results.find((r) => r.planId === "studio")!.priceId,
      STRIPE_PRICE_ENTERPRISE: results.find((r) => r.planId === "enterprise")!.priceId,
    };

    return new Response(
      JSON.stringify({
        ok: true,
        stripeMode: stripeSecret.startsWith("sk_test_") ? "test" : "live",
        plans: results,
        secrets,
        nextStep: "Set Supabase secrets STRIPE_PRICE_STARTER, STRIPE_PRICE_STUDIO, STRIPE_PRICE_ENTERPRISE to the values in secrets.",
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@16.12.0";
import {
  canManageOrganizationBilling,
  resolveOrganizationForUser,
} from "../_shared/organization.ts";
import {
  checkPlatformPrice,
  formatPriceSecretError,
  getPlatformPriceSecret,
  type PlatformPlanId,
} from "../_shared/stripe-platform-billing.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ACTIVE_STATUSES = ["trialing", "active", "past_due"];

function parseBearerJwt(req: Request): string | null {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m ? m[1].trim() : null;
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

    const token = parseBearerJwt(req);
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authData.user;
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const planId = typeof body.planId === "string" ? body.planId.toLowerCase() : null;

    if (!planId || !["starter", "studio", "enterprise"].includes(planId)) {
      return new Response(JSON.stringify({ error: "planId must be starter, studio, or enterprise" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const platformPlanId = planId as PlatformPlanId;
    const stripePriceId = getPlatformPriceSecret(platformPlanId);
    if (!stripePriceId) {
      return new Response(JSON.stringify({ error: "Stripe price not configured for this plan" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const formatError = formatPriceSecretError(stripePriceId, platformPlanId);
    if (formatError) {
      return new Response(JSON.stringify({ error: formatError }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = await resolveOrganizationForUser(admin, user.id);
    if (!orgId) {
      return new Response(JSON.stringify({ error: "No organization found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!(await canManageOrganizationBilling(admin, user.id, orgId))) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: targetPlan } = await admin
      .from("subscription_plans")
      .select("id, max_artist_seats, is_self_serve")
      .eq("id", planId)
      .eq("is_active", true)
      .single();

    if (!targetPlan?.is_self_serve) {
      return new Response(JSON.stringify({ error: "Plan is not available for self-serve billing" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subRow } = await admin
      .from("platform_subscriptions")
      .select("plan_id, status, stripe_subscription_id")
      .eq("organization_id", orgId)
      .maybeSingle();

    if (subRow?.plan_id === planId && ACTIVE_STATUSES.includes(subRow.status ?? "")) {
      return new Response(JSON.stringify({ ok: true, alreadyOnPlan: true, planId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (targetPlan.max_artist_seats != null) {
      const { data: seatCount } = await admin.rpc("org_artist_seat_count", { _org_id: orgId });
      const used = typeof seatCount === "number" ? seatCount : 0;
      if (used > targetPlan.max_artist_seats) {
        return new Response(
          JSON.stringify({
            error: `Cannot downgrade: you have ${used} artist seats in use but ${planId} allows ${targetPlan.max_artist_seats}. Remove staff first.`,
            code: "seat_limit_exceeded",
            used,
            max: targetPlan.max_artist_seats,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const stripe = new Stripe(stripeSecret);
    const priceCheck = await checkPlatformPrice(stripe, platformPlanId);
    if (!priceCheck.ok && priceCheck.error) {
      return new Response(JSON.stringify({ error: priceCheck.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeSubId = subRow?.stripe_subscription_id;
    const hasActiveSub = !!subRow && ACTIVE_STATUSES.includes(subRow.status ?? "") && !!stripeSubId;

    if (!hasActiveSub) {
      return new Response(
        JSON.stringify({
          error: "No active subscription to change. Use checkout to subscribe.",
          code: "checkout_required",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const subscription = await stripe.subscriptions.retrieve(stripeSubId);
    const itemId = subscription.items.data[0]?.id;
    if (!itemId) {
      return new Response(JSON.stringify({ error: "Subscription has no billable items" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const updated = await stripe.subscriptions.update(stripeSubId, {
      items: [{ id: itemId, price: stripePriceId }],
      proration_behavior: "create_prorations",
      metadata: {
        ...subscription.metadata,
        organization_id: orgId,
        plan_id: planId,
      },
    });

    await admin
      .from("platform_subscriptions")
      .update({
        plan_id: planId,
        stripe_price_id: stripePriceId,
        status: updated.status,
        current_period_start: new Date(updated.current_period_start * 1000).toISOString(),
        current_period_end: new Date(updated.current_period_end * 1000).toISOString(),
        cancel_at_period_end: updated.cancel_at_period_end,
      })
      .eq("organization_id", orgId);

    return new Response(
      JSON.stringify({
        ok: true,
        planId,
        status: updated.status,
        currentPeriodEnd: new Date(updated.current_period_end * 1000).toISOString(),
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

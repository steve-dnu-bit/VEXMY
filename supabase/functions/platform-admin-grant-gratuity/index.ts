import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@16.12.0";
import { jsonResponse, requireAuthenticatedUser } from "../_shared/auth.ts";
import { isPlatformPlanId } from "../_shared/stripe-platform-billing.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const auth = await requireAuthenticatedUser(admin, req);
    if ("status" in auth) {
      return jsonResponse(auth.body, auth.status);
    }

    const { data: isPlatformAdmin, error: adminError } = await admin.rpc("is_platform_admin", {
      _user_id: auth.user.id,
    });
    if (adminError || !isPlatformAdmin) {
      return jsonResponse({ error: "Platform admin required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const organizationId = typeof body.organizationId === "string" ? body.organizationId : null;
    const planId = typeof body.planId === "string" ? body.planId.toLowerCase() : null;
    const monthsRaw = typeof body.months === "number" ? body.months : Number(body.months);
    const note = typeof body.note === "string" ? body.note.trim() : null;
    const cancelStripe = body.cancelStripe !== false;

    if (!organizationId) {
      return jsonResponse({ error: "organizationId is required" }, 400);
    }
    if (!isPlatformPlanId(planId)) {
      return jsonResponse({ error: "planId must be solo, starter, studio, or enterprise" }, 400);
    }

    const months = Number.isFinite(monthsRaw)
      ? Math.max(1, Math.min(Math.floor(monthsRaw), 120))
      : 12;

    const { data: org, error: orgError } = await admin
      .from("organizations")
      .select("id, name")
      .eq("id", organizationId)
      .maybeSingle();
    if (orgError) return jsonResponse({ error: orgError.message }, 500);
    if (!org) return jsonResponse({ error: "Organization not found" }, 404);

    const { data: existing, error: subError } = await admin
      .from("platform_subscriptions")
      .select("id, stripe_subscription_id, status")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (subError) return jsonResponse({ error: subError.message }, 500);

    let stripeCanceled = false;
    let stripeError: string | null = null;
    const stripeSubId = existing?.stripe_subscription_id ?? null;

    if (cancelStripe && stripeSubId && stripeSecret) {
      try {
        const stripe = new Stripe(stripeSecret);
        await stripe.subscriptions.cancel(stripeSubId);
        stripeCanceled = true;
      } catch (e) {
        stripeError = e instanceof Error ? e.message : "Stripe cancel failed";
      }
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + months);

    const { error: upsertError } = await admin.from("platform_subscriptions").upsert(
      {
        organization_id: organizationId,
        plan_id: planId,
        status: "active",
        stripe_subscription_id: null,
        stripe_price_id: null,
        trial_end: null,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
        canceled_at: null,
        updated_at: now.toISOString(),
      },
      { onConflict: "organization_id" },
    );
    if (upsertError) return jsonResponse({ error: upsertError.message }, 500);

    await admin.from("organizations").update({ status: "active", updated_at: now.toISOString() }).eq("id", organizationId);

    await admin.from("subscription_events").insert({
      organization_id: organizationId,
      event_type: "platform_admin_gratuity",
      payload: {
        granted_by: auth.user.id,
        plan_id: planId,
        months,
        period_end: periodEnd.toISOString(),
        note,
        previous_status: existing?.status ?? null,
        stripe_canceled: stripeCanceled,
        stripe_error: stripeError,
        had_stripe_subscription: !!stripeSubId,
      },
    });

    if (stripeError && stripeSubId && cancelStripe) {
      return jsonResponse({
        ok: true,
        organizationId,
        planId,
        status: "active",
        isGratuity: true,
        currentPeriodEnd: periodEnd.toISOString(),
        stripeCanceled: false,
        warning: `Gratuity granted, but Stripe cancel failed: ${stripeError}`,
      });
    }

    return jsonResponse({
      ok: true,
      organizationId,
      planId,
      status: "active",
      isGratuity: true,
      currentPeriodEnd: periodEnd.toISOString(),
      stripeCanceled,
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});

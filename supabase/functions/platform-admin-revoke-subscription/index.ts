import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@16.12.0";
import { jsonResponse, requireAuthenticatedUser } from "../_shared/auth.ts";

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
    const note = typeof body.note === "string" ? body.note.trim() : null;

    if (!organizationId) {
      return jsonResponse({ error: "organizationId is required" }, 400);
    }

    const { data: subscription, error: subError } = await admin
      .from("platform_subscriptions")
      .select("id, organization_id, plan_id, status, stripe_subscription_id")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (subError) {
      return jsonResponse({ error: subError.message }, 500);
    }
    if (!subscription) {
      return jsonResponse({ error: "Subscription not found for this studio" }, 404);
    }

    let stripeCanceled = false;
    let stripeError: string | null = null;

    if (subscription.stripe_subscription_id && stripeSecret) {
      try {
        const stripe = new Stripe(stripeSecret);
        await stripe.subscriptions.cancel(subscription.stripe_subscription_id);
        stripeCanceled = true;
      } catch (e) {
        stripeError = e instanceof Error ? e.message : "Stripe cancel failed";
      }
    }

    const now = new Date().toISOString();
    const { error: updateError } = await admin
      .from("platform_subscriptions")
      .update({
        status: "canceled",
        canceled_at: now,
        cancel_at_period_end: false,
        current_period_end: now,
        trial_end: null,
        updated_at: now,
      })
      .eq("organization_id", organizationId);

    if (updateError) {
      return jsonResponse({ error: updateError.message }, 500);
    }

    await admin.from("organizations").update({ status: "canceled", updated_at: now }).eq("id", organizationId);

    await admin.from("subscription_events").insert({
      organization_id: organizationId,
      event_type: "platform_admin_revoke",
      payload: {
        revoked_by: auth.user.id,
        previous_status: subscription.status,
        stripe_subscription_id: subscription.stripe_subscription_id,
        stripe_canceled: stripeCanceled,
        stripe_error: stripeError,
        note,
      },
    });

    if (stripeError && subscription.stripe_subscription_id) {
      return jsonResponse({
        ok: true,
        organizationId,
        status: "canceled",
        stripeCanceled: false,
        warning: `Access revoked in Velbok, but Stripe cancel failed: ${stripeError}`,
      });
    }

    return jsonResponse({
      ok: true,
      organizationId,
      status: "canceled",
      stripeCanceled,
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@16.12.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function parseBearerJwt(req: Request): string | null {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m ? m[1].trim() : null;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63) || "studio";
}

function getStripePriceId(planId: string): string | null {
  const map: Record<string, string | undefined> = {
    starter: Deno.env.get("STRIPE_PRICE_STARTER"),
    studio: Deno.env.get("STRIPE_PRICE_STUDIO"),
    enterprise: Deno.env.get("STRIPE_PRICE_ENTERPRISE"),
  };
  return map[planId] ?? null;
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
    const studioName = typeof body.studioName === "string" ? body.studioName.trim() : null;
    const organizationId = typeof body.organizationId === "string" ? body.organizationId : null;

    if (!planId || !["starter", "studio", "enterprise"].includes(planId)) {
      return new Response(JSON.stringify({ error: "planId must be starter, studio, or enterprise" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripePriceId = getStripePriceId(planId);
    if (!stripePriceId) {
      return new Response(JSON.stringify({ error: "Stripe price not configured for this plan" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: planRow } = await admin
      .from("subscription_plans")
      .select("id, name, trial_days, is_self_serve")
      .eq("id", planId)
      .eq("is_active", true)
      .single();

    if (!planRow?.is_self_serve) {
      return new Response(JSON.stringify({ error: "Plan is not available for self-serve checkout" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeSecret);
    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "http://localhost:8080";
    const baseUrl = origin.replace(/\/$/, "");

    let orgId = organizationId;
    let orgRecord: { id: string; name: string; stripe_customer_id: string | null } | null = null;

    if (orgId) {
      const { data: existingOrg } = await admin
        .from("organizations")
        .select("id, name, stripe_customer_id")
        .eq("id", orgId)
        .single();
      if (!existingOrg) {
        return new Response(JSON.stringify({ error: "Organization not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: membership } = await admin
        .from("organization_members")
        .select("role")
        .eq("organization_id", orgId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!membership || !["owner", "admin"].includes(membership.role)) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      orgRecord = existingOrg;
    } else {
      if (!studioName || studioName.length < 2) {
        return new Response(JSON.stringify({ error: "studioName is required for new subscriptions" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const baseSlug = slugify(studioName);
      let slug = baseSlug;
      for (let i = 0; i < 5; i++) {
        const { data: clash } = await admin.from("organizations").select("id").eq("slug", slug).maybeSingle();
        if (!clash) break;
        slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      }

      const { data: newOrg, error: orgError } = await admin
        .from("organizations")
        .insert({
          name: studioName,
          slug,
          owner_user_id: user.id,
          status: "pending",
        })
        .select("id, name, stripe_customer_id")
        .single();

      if (orgError || !newOrg) {
        return new Response(JSON.stringify({ error: orgError?.message || "Failed to create organization" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await admin.from("organization_members").insert({
        organization_id: newOrg.id,
        user_id: user.id,
        role: "owner",
      });

      await admin.from("user_roles").upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id,role" });

      await admin.from("shop_settings").insert({
        organization_id: newOrg.id,
        shop_name: studioName,
        legal_name: `${studioName} Ltd`,
        trading_name: studioName,
        setup_completed_at: null,
      });

      orgId = newOrg.id;
      orgRecord = newOrg;
    }

    let customerId = orgRecord?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: orgRecord?.name ?? studioName ?? undefined,
        metadata: {
          organization_id: orgId!,
          user_id: user.id,
        },
      });
      customerId = customer.id;
      await admin.from("organizations").update({ stripe_customer_id: customerId }).eq("id", orgId);
    }

    const trialDays = planRow?.trial_days ?? 14;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      success_url: `${baseUrl}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/subscribe?plan=${planId}&canceled=1`,
      line_items: [{ price: stripePriceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: trialDays > 0 ? trialDays : undefined,
        metadata: {
          organization_id: orgId!,
          plan_id: planId,
        },
      },
      metadata: {
        kind: "platform_subscription",
        organization_id: orgId!,
        plan_id: planId,
      },
      allow_promotion_codes: true,
    });

    await admin.from("platform_subscriptions").upsert(
      {
        organization_id: orgId,
        plan_id: planId,
        status: "incomplete",
        stripe_price_id: stripePriceId,
      },
      { onConflict: "organization_id" },
    );

    return new Response(
      JSON.stringify({
        ok: true,
        checkoutUrl: session.url,
        checkoutSessionId: session.id,
        organizationId: orgId,
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

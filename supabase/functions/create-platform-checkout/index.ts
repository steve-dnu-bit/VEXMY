import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@16.12.0";
import {
  canManageOrganizationBilling,
  loadOrganizationRecord,
  resolveOrganizationForUser,
} from "../_shared/organization.ts";
import {
  checkPlatformPrice,
  formatPriceSecretError,
  getPlatformPriceSecret,
  getPlatformPriceSecretForCurrency,
  platformPriceSecretName,
  type PlatformPlanId,
} from "../_shared/stripe-platform-billing.ts";
import { getOrgBillingContext } from "../_shared/org-billing.ts";

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

    const platformPlanId = planId as PlatformPlanId;

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

    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "http://localhost:8080";
    const baseUrl = origin.replace(/\/$/, "");

    let orgId = organizationId ?? (await resolveOrganizationForUser(admin, user.id));
    let orgRecord: { id: string; name: string; stripe_customer_id: string | null } | null = null;

    if (orgId) {
      if (!(await canManageOrganizationBilling(admin, user.id, orgId))) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { org, error: orgLoadError } = await loadOrganizationRecord(admin, orgId);
      if (orgLoadError) {
        return new Response(JSON.stringify({ error: orgLoadError }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!org) {
        return new Response(JSON.stringify({ error: "Organization not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      orgRecord = org;
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

    const billingCtx = await getOrgBillingContext(admin, orgId);

    const { data: planPriceRow } = await admin
      .from("subscription_plan_prices")
      .select("stripe_price_id")
      .eq("plan_id", planId)
      .eq("currency", billingCtx.currency)
      .maybeSingle();

    let stripePriceId = planPriceRow?.stripe_price_id
      ?? getPlatformPriceSecretForCurrency(platformPlanId, billingCtx.currency);

    // Stripe deprecated BGN — platform checkout uses EUR prices for Bulgarian studios
    if (!stripePriceId && billingCtx.currency === "bgn") {
      const { data: eurRow } = await admin
        .from("subscription_plan_prices")
        .select("stripe_price_id")
        .eq("plan_id", planId)
        .eq("currency", "eur")
        .maybeSingle();
      stripePriceId = eurRow?.stripe_price_id
        ?? getPlatformPriceSecretForCurrency(platformPlanId, "eur");
    }

    if (!stripePriceId) {
      const hint = billingCtx.currency === "gbp"
        ? `Set STRIPE_PRICE_${planId.toUpperCase()} in Supabase secrets.`
        : `Set ${platformPriceSecretName(platformPlanId, billingCtx.currency)} or subscription_plan_prices.stripe_price_id for ${billingCtx.currency}.`;
      return new Response(JSON.stringify({ error: `Stripe price not configured for ${planId} (${billingCtx.currency}). ${hint}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const formatError = formatPriceSecretError(stripePriceId, platformPlanId, billingCtx.currency);
    if (formatError) {
      return new Response(JSON.stringify({ error: formatError }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeSecret);

    if (billingCtx.currency === "gbp") {
      const priceCheck = await checkPlatformPrice(stripe, platformPlanId);
      if (!priceCheck.ok && priceCheck.error) {
        return new Response(JSON.stringify({ error: priceCheck.error }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      try {
        const price = await stripe.prices.retrieve(stripePriceId);
        if (!price.recurring) {
          return new Response(JSON.stringify({
            error: `${platformPriceSecretName(platformPlanId, billingCtx.currency)} must be a recurring subscription price.`,
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const allowedCurrencies = billingCtx.currency === "bgn"
          ? ["bgn", "eur"]
          : [billingCtx.currency];
        if (price.currency && !allowedCurrencies.includes(price.currency)) {
          return new Response(JSON.stringify({
            error: `Stripe price currency (${price.currency}) does not match org billing currency (${billingCtx.currency}).`,
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown Stripe error";
        return new Response(JSON.stringify({ error: msg }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

    const { data: orgBillingRow } = await admin
      .from("organizations")
      .select("billing_country_code, billing_address_line1, billing_city, billing_postcode, tax_id")
      .eq("id", orgId)
      .maybeSingle();

    const stripeTaxEnabled = (Deno.env.get("STRIPE_TAX_ENABLED") ?? "").toLowerCase() === "true";
    const billingCountry = orgBillingRow?.billing_country_code ?? billingCtx.countryCode;

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
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
        ...(stripeTaxEnabled && billingCountry
          ? {
            automatic_tax: { enabled: true },
            customer_update: { address: "auto" },
            tax_id_collection: { enabled: true },
          }
          : {}),
        ...(billingCountry
          ? {
            billing_address_collection: "required",
          }
          : {}),
      });
    } catch (checkoutError) {
      const msg = checkoutError instanceof Error ? checkoutError.message : "Could not create Stripe checkout";
      const friendly = msg.includes("No such price")
        ? `Invalid Stripe price for ${planId}. Set STRIPE_PRICE_${planId.toUpperCase()} to a price_... ID (not prod_...) from the same test/live mode as STRIPE_SECRET_KEY.`
        : msg;
      return new Response(JSON.stringify({ error: friendly }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

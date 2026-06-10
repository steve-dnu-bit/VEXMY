import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@16.12.0";
import { resolveOrganizationForUser } from "../_shared/organization.ts";
import {
  canManageStripeConnect,
  getConnectStatusForOrg,
  mapShopCountryToStripe,
  syncConnectAccountFromStripe,
} from "../_shared/stripe-connect.ts";

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

function sanitizeReturnPath(path: unknown, fallback: string): string {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) return fallback;
  return path;
}

function buildConnectReturnUrl(baseUrl: string, path: string, connectParam: "return" | "refresh"): string {
  const url = new URL(sanitizeReturnPath(path, "/admin"), baseUrl);
  url.searchParams.set("connect", connectParam);
  return url.toString();
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

    const organizationId = await resolveOrganizationForUser(admin, user.id);

    if (!organizationId) {
      return new Response(JSON.stringify({ error: "No organization found. Subscribe to a plan first." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!(await canManageStripeConnect(admin, user.id, organizationId))) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action === "onboard" ? "onboard" : body.action === "dashboard" ? "dashboard" : "status";

    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "http://localhost:8080";
    const baseUrl = origin.replace(/\/$/, "");

    const stripe = new Stripe(stripeSecret);

    const { data: org, error: orgError } = await admin
      .from("organizations")
      .select("id, name, stripe_connect_account_id")
      .eq("id", organizationId)
      .maybeSingle();

    if (orgError) {
      return new Response(JSON.stringify({ error: orgError.message }), {
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

    if (action === "status") {
      let status = await getConnectStatusForOrg(admin, organizationId);
      if (status.accountId) {
        status = (await syncConnectAccountFromStripe(admin, stripe, status.accountId)) ?? status;
      }
      return new Response(JSON.stringify({ ok: true, organizationId, ...status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: shop } = await admin
      .from("shop_settings")
      .select("shop_name, legal_name, trading_name, support_email, website_url, country")
      .eq("organization_id", organizationId)
      .maybeSingle();

    let accountId = org.stripe_connect_account_id;
    if (!accountId) {
      const shopName = shop?.trading_name || shop?.shop_name || org.name;
      const account = await stripe.accounts.create({
        type: "express",
        country: mapShopCountryToStripe(shop?.country),
        email: shop?.support_email || user.email || undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "company",
        metadata: { organization_id: organizationId },
        business_profile: {
          name: shopName,
          support_email: shop?.support_email || user.email || undefined,
          url: shop?.website_url || undefined,
        },
      });
      accountId = account.id;
      await admin
        .from("organizations")
        .update({ stripe_connect_account_id: accountId })
        .eq("id", organizationId);
    }

    if (action === "dashboard") {
      const loginLink = await stripe.accounts.createLoginLink(accountId);
      return new Response(JSON.stringify({ ok: true, dashboardUrl: loginLink.url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const returnPath = sanitizeReturnPath(body.returnPath, "/admin");
    const refreshPath = sanitizeReturnPath(body.refreshPath, "/admin");
    const returnUrl = buildConnectReturnUrl(baseUrl, returnPath, "return");
    const refreshUrl = buildConnectReturnUrl(baseUrl, refreshPath, "refresh");

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return new Response(
      JSON.stringify({
        ok: true,
        onboardingUrl: accountLink.url,
        accountId,
        organizationId,
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

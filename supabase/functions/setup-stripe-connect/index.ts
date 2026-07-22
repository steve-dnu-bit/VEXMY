import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildConnectExpressAccountParams, resolveConnectAccountId, syncConnectAccountFromStripe } from "../_shared/stripe-connect.ts";
import { createConnectStripe, getConnectStripeSecret, hasSeparateConnectStripeAccount, stripeSecretMode } from "../_shared/stripe-keys.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const stripeSecret = getConnectStripeSecret();
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
    const baseUrl = (Deno.env.get("SITE_URL") || "https://velbok.com").replace(/\/$/, "");
    const returnPath = typeof body.returnPath === "string" && body.returnPath.startsWith("/")
      ? body.returnPath
      : "/admin";
    const syncOnly = body.syncOnly === true;

    const admin = createClient(supabaseUrl, serviceKey);
    const stripe = createConnectStripe();

    const { data: orgs, error: orgsError } = await admin
      .from("organizations")
      .select("id, name, stripe_connect_account_id")
      .order("created_at", { ascending: true });

    if (orgsError) {
      return new Response(JSON.stringify({ error: orgsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const org of orgs ?? []) {
      const { data: shop } = await admin
        .from("shop_settings")
        .select("shop_name, legal_name, trading_name, support_email, website_url, country, stripe_business_type")
        .eq("organization_id", org.id)
        .maybeSingle();

      const shopName = shop?.trading_name || shop?.shop_name || org.name;
      let accountId = org.stripe_connect_account_id;
      let createdAccount = false;

      const resolvedAccountId = await resolveConnectAccountId(stripe, org.id, accountId);
      if (resolvedAccountId) {
        accountId = resolvedAccountId;
        if (resolvedAccountId !== org.stripe_connect_account_id) {
          await admin
            .from("organizations")
            .update({ stripe_connect_account_id: resolvedAccountId })
            .eq("id", org.id);
        }
      } else if (syncOnly) {
        if (!accountId) continue;
      } else {
        const account = await stripe.accounts.create(
          buildConnectExpressAccountParams(org.id, org.name, shop),
          {
            idempotencyKey: `velbok-connect-express-v3-${org.id}-${
              shop?.stripe_business_type === "individual" ? "individual" : "company"
            }`,
          },
        );
        accountId = account.id;
        createdAccount = true;
        await admin
          .from("organizations")
          .update({ stripe_connect_account_id: accountId })
          .eq("id", org.id);
      }

      const status = (await syncConnectAccountFromStripe(admin, stripe, accountId)) ?? {
        accountId,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        onboardedAt: null,
        ready: false,
      };

      let onboardingUrl: string | null = null;
      if (!status.ready) {
        const returnUrl = new URL(returnPath, baseUrl);
        returnUrl.searchParams.set("connect", "return");
        const refreshUrl = new URL(returnPath, baseUrl);
        refreshUrl.searchParams.set("connect", "refresh");

        const accountLink = await stripe.accountLinks.create({
          account: accountId,
          refresh_url: refreshUrl.toString(),
          return_url: returnUrl.toString(),
          type: "account_onboarding",
        });
        onboardingUrl = accountLink.url;
      }

      results.push({
        organizationId: org.id,
        organizationName: org.name,
        shopName,
        accountId,
        createdAccount,
        ready: status.ready,
        chargesEnabled: status.chargesEnabled,
        payoutsEnabled: status.payoutsEnabled,
        detailsSubmitted: status.detailsSubmitted,
        onboardingUrl,
      });
    }

    const allReady = results.length > 0 && results.every((r) => r.ready);

    return new Response(
      JSON.stringify({
        ok: true,
        stripeMode: stripeSecretMode(stripeSecret),
        connectPlatformSeparate: hasSeparateConnectStripeAccount(),
        allReady,
        organizations: results,
        nextStep: allReady
          ? "All organizations have active Connect accounts."
          : "Open each onboardingUrl in a browser and complete Stripe identity + bank details.",
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

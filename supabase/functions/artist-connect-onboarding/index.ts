import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveOrganizationForUser } from "../_shared/organization.ts";
import {
  assertConnectPlatformReady,
  buildArtistConnectExpressAccountParams,
  canArtistSetupPosConnect,
  getArtistConnectStatus,
  getConnectStatusForOrg,
  resolveArtistConnectAccountId,
  syncArtistConnectAccountFromStripe,
} from "../_shared/stripe-connect.ts";
import { createConnectStripe, getConnectStripeSecret } from "../_shared/stripe-keys.ts";

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

function buildArtistConnectReturnUrl(baseUrl: string, path: string, connectParam: "return" | "refresh"): string {
  const url = new URL(sanitizeReturnPath(path, "/settings"), baseUrl);
  url.searchParams.set("artistConnect", connectParam);
  return url.toString();
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
      return new Response(JSON.stringify({ error: "No organization found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!(await canArtistSetupPosConnect(admin, user.id, organizationId))) {
      return new Response(JSON.stringify({ error: "Forbidden", code: "artist_pos_connect_only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action === "onboard" ? "onboard" : body.action === "dashboard" ? "dashboard" : "status";

    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "http://localhost:8080";
    const baseUrl = origin.replace(/\/$/, "");
    const stripe = createConnectStripe();

    const shopConnect = await getConnectStatusForOrg(admin, organizationId);
    const shopReady = shopConnect.ready;

    const { data: shop } = await admin
      .from("shop_settings")
      .select("shop_name, country")
      .eq("organization_id", organizationId)
      .maybeSingle();

    const { data: profile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle();

    const artistName = profile?.display_name?.trim() || user.email?.split("@")[0] || "Artist";

    if (action === "status") {
      let status = await getArtistConnectStatus(admin, organizationId, user.id);
      if (status.accountId) {
        status = (await syncArtistConnectAccountFromStripe(admin, stripe, status.accountId)) ?? status;
      }

      return new Response(
        JSON.stringify({
          ok: true,
          organizationId,
          shopReady,
          shopName: shop?.shop_name ?? null,
          ...status,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!shopReady) {
      return new Response(
        JSON.stringify({
          error: "Your studio must finish payout setup before artists can connect bank accounts.",
          code: "shop_connect_required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: existingSplit } = await admin
      .from("artist_pos_splits")
      .select("stripe_connect_account_id")
      .eq("organization_id", organizationId)
      .eq("artist_id", user.id)
      .maybeSingle();

    let accountId = await resolveArtistConnectAccountId(
      stripe,
      organizationId,
      user.id,
      existingSplit?.stripe_connect_account_id,
    );

    if (!accountId) {
      await assertConnectPlatformReady(stripe);
      const account = await stripe.accounts.create(
        buildArtistConnectExpressAccountParams(
          organizationId,
          user.id,
          artistName,
          shop,
          user.email ?? "",
        ),
        { idempotencyKey: `velbok-artist-connect-${organizationId}-${user.id}` },
      );
      accountId = account.id;
    }

    await syncArtistConnectAccountFromStripe(admin, stripe, accountId);

    if (action === "dashboard") {
      const loginLink = await stripe.accounts.createLoginLink(accountId);
      return new Response(JSON.stringify({ ok: true, dashboardUrl: loginLink.url, accountId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const returnPath = sanitizeReturnPath(body.returnPath, "/settings");
    const refreshPath = sanitizeReturnPath(body.refreshPath, "/settings");
    const returnUrl = buildArtistConnectReturnUrl(baseUrl, returnPath, "return");
    const refreshUrl = buildArtistConnectReturnUrl(baseUrl, refreshPath, "refresh");

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

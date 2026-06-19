import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@16.12.0";
import { callerIsPlatformAdmin, jsonCorsHeaders, jsonResponse, requireAuthenticatedUser } from "../_shared/auth.ts";
import {
  getConnectStripeSecret,
  getPlatformStripeSecret,
  hasSeparateConnectStripeAccount,
  stripeSecretMode,
} from "../_shared/stripe-keys.ts";

const corsHeaders = jsonCorsHeaders;

async function fetchStripeAccount(secret: string): Promise<Stripe.Account | null> {
  const res = await fetch("https://api.stripe.com/v1/account", {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) return null;
  return await res.json() as Stripe.Account;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const authResult = await requireAuthenticatedUser(admin, req);
    if ("status" in authResult) {
      return jsonResponse(authResult.body, authResult.status);
    }

    const isPlatformAdmin = await callerIsPlatformAdmin(admin, authResult.user.id);
    if (!isPlatformAdmin) {
      return jsonResponse({ error: "Forbidden", reason: "platform_admin_required" }, 403);
    }

    const platformSecret = getPlatformStripeSecret();
    const connectSecret = getConnectStripeSecret();
    if (!platformSecret || !connectSecret) {
      return jsonResponse({ error: "Stripe secrets not configured" }, 500);
    }

    const platformAccount = await fetchStripeAccount(platformSecret);
    const connectAccount = await fetchStripeAccount(connectSecret);
    const platformStripe = new Stripe(platformSecret);
    const connectStripe = new Stripe(connectSecret);

    async function probeExpressCreate(stripe: Stripe): Promise<{ ok: boolean; error: string | null }> {
      try {
        const probe = await stripe.accounts.create({
          type: "express",
          country: "GB",
          capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
          metadata: { velbok_connect_probe: "delete_me" },
        });
        try {
          await stripe.accounts.del(probe.id);
        } catch {
          /* best-effort */
        }
        return { ok: true, error: null };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    const platformProbe = await probeExpressCreate(platformStripe);
    const connectProbe = await probeExpressCreate(connectStripe);
    const separate = hasSeparateConnectStripeAccount();

    return jsonResponse({
      ok: true,
      separateConnectKey: separate,
      platform: {
        mode: stripeSecretMode(platformSecret),
        accountId: platformAccount?.id ?? null,
        businessName: platformAccount?.business_profile?.name ?? platformAccount?.settings?.dashboard?.display_name ?? null,
        canCreateExpressAccounts: platformProbe.ok,
        error: platformProbe.error,
      },
      connect: {
        mode: stripeSecretMode(connectSecret),
        accountId: connectAccount?.id ?? null,
        businessName: connectAccount?.business_profile?.name ?? connectAccount?.settings?.dashboard?.display_name ?? null,
        canCreateExpressAccounts: connectProbe.ok,
        error: connectProbe.error,
      },
      hint: connectProbe.ok
        ? "Connect is ready on the shop account. Use Admin → Payouts → Set up payouts."
        : platformProbe.ok
          ? "Shop Connect is not ready, but Velbok can host Express accounts. Remove STRIPE_CONNECT_SECRET_KEY in Supabase (or set it equal to STRIPE_SECRET_KEY) and retry payout setup."
          : connectProbe.error ?? platformProbe.error ?? "Complete Stripe Connect platform profile on the shop account.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});

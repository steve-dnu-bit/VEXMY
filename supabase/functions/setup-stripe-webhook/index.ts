import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@16.12.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "account.updated",
];

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

function resolveWebhookUrl(): string {
  const projectRef = Deno.env.get("SUPABASE_PROJECT_REF") ?? "tkremoxfkgoiuwghtzwd";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (supabaseUrl) {
    return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/stripe-webhook`;
  }
  return `https://${projectRef}.supabase.co/functions/v1/stripe-webhook`;
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

    const body = await req.json().catch(() => ({}));
    const skipDatabaseReset = body.skipDatabaseReset === true;

    const stripe = new Stripe(stripeSecret);
    const webhookUrl = resolveWebhookUrl();

    const existing = await stripe.webhookEndpoints.list({ limit: 100 });
    const matches = existing.data.filter((ep) => ep.url === webhookUrl);
    const removed: string[] = [];
    for (const ep of matches) {
      await stripe.webhookEndpoints.del(ep.id);
      removed.push(ep.id);
    }

    const endpoint = await stripe.webhookEndpoints.create({
      url: webhookUrl,
      enabled_events: WEBHOOK_EVENTS,
      description: "Velbok Supabase edge function",
      metadata: { velbok: "true" },
    });

    let databaseReset = false;
    if (!skipDatabaseReset) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const admin = createClient(supabaseUrl, serviceKey);
      const zeroUuid = "00000000-0000-0000-0000-000000000000";

      await admin.from("organizations").update({
        stripe_customer_id: null,
        stripe_connect_account_id: null,
        stripe_connect_charges_enabled: false,
        stripe_connect_payouts_enabled: false,
        stripe_connect_details_submitted: false,
        stripe_connect_onboarded_at: null,
      }).neq("id", zeroUuid);

      await admin.from("companies").update({
        stripe_account_id: null,
        updated_at: new Date().toISOString(),
      }).not("stripe_account_id", "is", null);

      await admin.from("subscription_events").delete().neq("id", zeroUuid);
      await admin.from("platform_subscriptions").delete().neq("organization_id", zeroUuid);
      databaseReset = true;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        stripeMode: stripeSecret.startsWith("sk_test_") ? "test" : "live",
        webhookUrl,
        endpointId: endpoint.id,
        removedEndpointIds: removed,
        databaseReset,
        secrets: {
          STRIPE_WEBHOOK_SECRET: endpoint.secret,
        },
        nextStep: "Set Supabase secret STRIPE_WEBHOOK_SECRET to the value in secrets.",
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "npm:stripe@16.12.0";
import { getConnectStripeSecret, stripeSecretMode } from "../_shared/stripe-keys.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CONNECT_WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "account.updated",
  "payment_intent.succeeded",
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
    const connectSecret = getConnectStripeSecret();
    if (!serviceKey || !connectSecret) {
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

    const stripe = new Stripe(connectSecret);
    const webhookUrl = resolveWebhookUrl();

    const existing = await stripe.webhookEndpoints.list({ limit: 100 });
    const matches = existing.data.filter(
      (ep) => ep.url === webhookUrl && ep.metadata?.velbok_connect === "true",
    );
    const removed: string[] = [];
    for (const ep of matches) {
      await stripe.webhookEndpoints.del(ep.id);
      removed.push(ep.id);
    }

    const endpoint = await stripe.webhookEndpoints.create({
      url: webhookUrl,
      enabled_events: CONNECT_WEBHOOK_EVENTS,
      description: "Velbok Connect (shop payouts) Supabase edge function",
      metadata: { velbok_connect: "true" },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        stripeMode: stripeSecretMode(connectSecret),
        connectPlatform: hasSeparateConnectPlatform(connectSecret),
        webhookUrl,
        endpointId: endpoint.id,
        removedEndpointIds: removed,
        secrets: {
          STRIPE_CONNECT_WEBHOOK_SECRET: endpoint.secret,
        },
        nextStep:
          "Set Supabase secret STRIPE_CONNECT_WEBHOOK_SECRET to secrets.STRIPE_CONNECT_WEBHOOK_SECRET, then redeploy stripe-webhook.",
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

function hasSeparateConnectPlatform(connectSecret: string): boolean {
  const platform = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  return !!platform && connectSecret !== platform;
}

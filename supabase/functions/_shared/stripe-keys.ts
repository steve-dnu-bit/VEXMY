import Stripe from "npm:stripe@16.12.0";

/** Velbok platform subscriptions (Velbok Co). */
export function getPlatformStripeSecret(): string {
  return Deno.env.get("STRIPE_SECRET_KEY") ?? "";
}

/** Tattoo shop payouts / Connect (e.g. Inkaholics Limited). Falls back to platform key. */
export function getConnectStripeSecret(): string {
  return Deno.env.get("STRIPE_CONNECT_SECRET_KEY") ?? getPlatformStripeSecret();
}

/** Require a dedicated Connect platform key (blocks silent fallback to Velbok). */
export function requireConnectStripeSecret(): string {
  const connect = Deno.env.get("STRIPE_CONNECT_SECRET_KEY") ?? "";
  if (!connect.trim()) {
    throw new Error(
      "STRIPE_CONNECT_SECRET_KEY is not set. Add the Inkaholics Limited secret key (sk_live_... or sk_test_...) in Supabase → Edge Functions → Secrets. Payout setup cannot use the Velbok subscription key.",
    );
  }
  return connect;
}

export function isConnectSecretConfigured(): boolean {
  return !!(Deno.env.get("STRIPE_CONNECT_SECRET_KEY") ?? "").trim();
}

export function hasSeparateConnectStripeAccount(): boolean {
  const connect = Deno.env.get("STRIPE_CONNECT_SECRET_KEY") ?? "";
  const platform = getPlatformStripeSecret();
  return !!connect && connect !== platform;
}

export function stripeSecretMode(secret: string): "test" | "live" | "unknown" {
  if (secret.startsWith("sk_test_")) return "test";
  if (secret.startsWith("sk_live_")) return "live";
  return "unknown";
}

export function createPlatformStripe(): Stripe {
  return new Stripe(getPlatformStripeSecret());
}

export function createConnectStripe(): Stripe {
  return new Stripe(getConnectStripeSecret());
}

export function createConnectStripeForOnboarding(): Stripe {
  return new Stripe(requireConnectStripeSecret());
}

export type WebhookVerifySource = "platform" | "connect";

export async function constructVerifiedStripeEvent(
  rawBody: string,
  signature: string,
): Promise<{ event: Stripe.Event; source: WebhookVerifySource; stripe: Stripe }> {
  const platformWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  const connectWebhookSecret = Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET") ?? "";

  const candidates: Array<{ webhookSecret: string; source: WebhookVerifySource; apiSecret: string }> = [];
  if (platformWebhookSecret) {
    candidates.push({
      webhookSecret: platformWebhookSecret,
      source: "platform",
      apiSecret: getPlatformStripeSecret(),
    });
  }
  if (connectWebhookSecret && connectWebhookSecret !== platformWebhookSecret) {
    candidates.push({
      webhookSecret: connectWebhookSecret,
      source: "connect",
      apiSecret: getConnectStripeSecret(),
    });
  }

  if (!candidates.length) {
    throw new Error("No Stripe webhook secrets configured");
  }

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const stripe = new Stripe(candidate.apiSecret);
      const event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        candidate.webhookSecret,
      );
      return { event, source: candidate.source, stripe };
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Webhook signature verification failed");
}

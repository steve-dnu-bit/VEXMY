import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@16.12.0";
import { resolveOrganizationForUser } from "./organization.ts";
import { stripeCountryForShopCountry } from "./shop-currency.ts";

export type ConnectAccountContext = {
  organizationId: string;
  stripeConnectAccountId: string;
};

export type ConnectStatus = {
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboardedAt: string | null;
  ready: boolean;
};

export function mapShopCountryToStripe(country: string | null | undefined): string {
  return stripeCountryForShopCountry(country);
}

export async function canManageStripeConnect(
  admin: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const { data: isPlatformAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isPlatformAdmin) return true;

  const { data: membership } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  return !!membership && ["owner", "admin"].includes(membership.role);
}

export async function syncConnectAccountFromStripe(
  admin: SupabaseClient,
  stripe: Stripe,
  accountId: string,
): Promise<ConnectStatus | null> {
  const account = await stripe.accounts.retrieve(accountId);
  const organizationId = account.metadata?.organization_id ?? null;

  const { data: existing } = organizationId
    ? await admin
      .from("organizations")
      .select("stripe_connect_onboarded_at")
      .eq("id", organizationId)
      .maybeSingle()
    : await admin
      .from("organizations")
      .select("stripe_connect_onboarded_at")
      .eq("stripe_connect_account_id", accountId)
      .maybeSingle();

  const isReady = !!account.charges_enabled && !!account.details_submitted;
  const patch = {
    stripe_connect_charges_enabled: !!account.charges_enabled,
    stripe_connect_payouts_enabled: !!account.payouts_enabled,
    stripe_connect_details_submitted: !!account.details_submitted,
    stripe_connect_onboarded_at: isReady
      ? (existing?.stripe_connect_onboarded_at ?? new Date().toISOString())
      : null,
  };

  if (organizationId) {
    await admin.from("organizations").update(patch).eq("id", organizationId);
  } else {
    await admin.from("organizations").update(patch).eq("stripe_connect_account_id", accountId);
  }

  const { data: company } = await admin
    .from("companies")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (company?.id) {
    await admin
      .from("companies")
      .update({ stripe_account_id: accountId, updated_at: new Date().toISOString() })
      .eq("id", company.id);
  }

  return {
    accountId,
    chargesEnabled: patch.stripe_connect_charges_enabled,
    payoutsEnabled: patch.stripe_connect_payouts_enabled,
    detailsSubmitted: patch.stripe_connect_details_submitted,
    onboardedAt: patch.stripe_connect_onboarded_at,
    ready: patch.stripe_connect_charges_enabled && patch.stripe_connect_details_submitted,
  };
}

export async function getConnectStatusForOrg(
  admin: SupabaseClient,
  organizationId: string,
): Promise<ConnectStatus> {
  const { data } = await admin
    .from("organizations")
    .select(
      "stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled, stripe_connect_details_submitted, stripe_connect_onboarded_at",
    )
    .eq("id", organizationId)
    .maybeSingle();

  const chargesEnabled = !!data?.stripe_connect_charges_enabled;
  const detailsSubmitted = !!data?.stripe_connect_details_submitted;

  return {
    accountId: data?.stripe_connect_account_id ?? null,
    chargesEnabled,
    payoutsEnabled: !!data?.stripe_connect_payouts_enabled,
    detailsSubmitted,
    onboardedAt: data?.stripe_connect_onboarded_at ?? null,
    ready: chargesEnabled && detailsSubmitted,
  };
}

export async function getConnectAccountForOrganization(
  admin: SupabaseClient,
  organizationId: string,
): Promise<ConnectAccountContext | null> {
  const { data: org } = await admin
    .from("organizations")
    .select("id, stripe_connect_account_id, stripe_connect_charges_enabled")
    .eq("id", organizationId)
    .maybeSingle();

  if (!org?.stripe_connect_account_id || !org.stripe_connect_charges_enabled) return null;

  return {
    organizationId: org.id,
    stripeConnectAccountId: org.stripe_connect_account_id,
  };
}

export async function getActiveConnectAccount(
  admin: SupabaseClient,
  options?: { organizationId?: string | null; userId?: string | null },
): Promise<ConnectAccountContext | null> {
  let orgId = options?.organizationId ?? null;

  if (!orgId && options?.userId) {
    orgId = await resolveOrganizationForUser(admin, options.userId);
  }

  if (!orgId) {
    const { data: shop } = await admin
      .from("shop_settings")
      .select("organization_id")
      .not("organization_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    orgId = shop?.organization_id ?? null;
    if (!orgId) {
      const { data: org } = await admin
        .from("organizations")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      orgId = org?.id ?? null;
    }
  }

  if (!orgId) return null;
  return getConnectAccountForOrganization(admin, orgId);
}

export function stripeRequestOptions(connectAccountId: string | null | undefined): Stripe.RequestOptions | undefined {
  if (!connectAccountId) return undefined;
  return { stripeAccount: connectAccountId };
}

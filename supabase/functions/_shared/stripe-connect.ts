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

type ShopConnectProfile = {
  shop_name?: string | null;
  legal_name?: string | null;
  trading_name?: string | null;
  support_email?: string | null;
  website_url?: string | null;
  country?: string | null;
};

/** Express connected account under the Velbok Connect platform (one per shop org). */
export function buildConnectExpressAccountParams(
  organizationId: string,
  orgName: string,
  shop: ShopConnectProfile | null | undefined,
  fallbackEmail?: string | null,
) {
  const tradingName = shop?.trading_name?.trim() || shop?.shop_name?.trim() || orgName;
  const legalName = shop?.legal_name?.trim() || tradingName;
  const supportEmail = shop?.support_email?.trim() || fallbackEmail?.trim() || undefined;

  return {
    type: "express" as const,
    country: mapShopCountryToStripe(shop?.country),
    email: supportEmail,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: "company" as const,
    company: { name: legalName },
    metadata: {
      organization_id: organizationId,
      legal_name: legalName,
      trading_name: tradingName,
    },
    business_profile: {
      name: tradingName,
      support_email: supportEmail,
      url: shop?.website_url || undefined,
    },
  };
}

export type ArtistConnectStatus = {
  accountId: string | null;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboardedAt: string | null;
  ready: boolean;
  artistSplitPercent: number | null;
  shopSplitPercent: number | null;
};

/** Express connected account for POS artist payout splits (one per artist per org). */
export function buildArtistConnectExpressAccountParams(
  organizationId: string,
  artistId: string,
  artistName: string,
  shop: ShopConnectProfile | null | undefined,
  email: string,
) {
  return {
    type: "express" as const,
    country: mapShopCountryToStripe(shop?.country),
    email: email.trim() || undefined,
    // card_payments is required by Stripe for Express onboarding on most platforms.
    // Desk/Tap to Pay charges always run on the studio Connect account — artists only receive split transfers.
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: "individual" as const,
    metadata: {
      organization_id: organizationId,
      artist_id: artistId,
      velbok_kind: "pos_artist",
    },
    business_profile: {
      name: artistName.trim() || "Artist",
    },
  };
}

/** Request card_payments + transfers on existing artist accounts (fixes transfers-only onboarding blocks). */
export async function ensureArtistConnectCapabilities(stripe: Stripe, accountId: string): Promise<void> {
  await stripe.accounts.update(accountId, {
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });
}

export async function findConnectAccountsForArtist(
  stripe: Stripe,
  organizationId: string,
  artistId: string,
): Promise<Stripe.Account[]> {
  try {
    const result = await stripe.accounts.search({
      query: `metadata['organization_id']:'${organizationId}' AND metadata['artist_id']:'${artistId}' AND metadata['velbok_kind']:'pos_artist'`,
      limit: 10,
    });
    return result.data;
  } catch {
    return [];
  }
}

export async function resolveArtistConnectAccountId(
  stripe: Stripe,
  organizationId: string,
  artistId: string,
  storedAccountId: string | null | undefined,
): Promise<string | null> {
  if (storedAccountId) {
    try {
      const account = await stripe.accounts.retrieve(storedAccountId);
      if (
        account.metadata?.velbok_kind === "pos_artist" &&
        account.metadata?.organization_id === organizationId &&
        account.metadata?.artist_id === artistId
      ) {
        return storedAccountId;
      }
    } catch {
      /* try metadata search */
    }
  }

  const matches = await findConnectAccountsForArtist(stripe, organizationId, artistId);
  if (!matches.length) return null;

  return [...matches].sort(
    (a, b) => connectAccountReadinessScore(b) - connectAccountReadinessScore(a),
  )[0].id;
}

export async function canArtistSetupPosConnect(
  admin: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const { data: isPlatformAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isPlatformAdmin) {
    const { data: artistRole } = await admin.rpc("has_role", { _user_id: userId, _role: "artist" });
    if (artistRole) return true;
  }

  const { data: membership } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) return false;

  const { data: artistRole } = await admin.rpc("has_role", { _user_id: userId, _role: "artist" });
  if (artistRole) return true;

  for (const feature of ["checkout", "billing"] as const) {
    const { data } = await admin.rpc("has_permission", { _user_id: userId, _feature: feature });
    if (data) return true;
  }
  return false;
}

export async function syncArtistConnectAccountFromStripe(
  admin: SupabaseClient,
  stripe: Stripe,
  accountId: string,
): Promise<ArtistConnectStatus | null> {
  const account = await stripe.accounts.retrieve(accountId);
  const organizationId = account.metadata?.organization_id ?? null;
  const artistId = account.metadata?.artist_id ?? null;
  if (account.metadata?.velbok_kind !== "pos_artist" || !organizationId || !artistId) {
    return null;
  }

  const { data: existing } = await admin
    .from("artist_pos_splits")
    .select("shop_split_percent, artist_split_percent, stripe_connect_onboarded_at")
    .eq("organization_id", organizationId)
    .eq("artist_id", artistId)
    .maybeSingle();

  let shopSplit = Number(existing?.shop_split_percent);
  let artistSplit = Number(existing?.artist_split_percent);
  if (!Number.isFinite(shopSplit) || !Number.isFinite(artistSplit)) {
    const { data: posSettings } = await admin
      .from("shop_pos_settings")
      .select("shop_split_percent, artist_split_percent")
      .eq("organization_id", organizationId)
      .maybeSingle();
    shopSplit = Number(posSettings?.shop_split_percent ?? 50);
    artistSplit = Number(posSettings?.artist_split_percent ?? 50);
  }

  const ready = !!account.payouts_enabled && !!account.details_submitted;
  const onboardedAt = ready
    ? (existing?.stripe_connect_onboarded_at ?? new Date().toISOString())
    : null;

  await admin.from("artist_pos_splits").upsert(
    {
      organization_id: organizationId,
      artist_id: artistId,
      shop_split_percent: shopSplit,
      artist_split_percent: artistSplit,
      stripe_connect_account_id: accountId,
      stripe_connect_payouts_enabled: !!account.payouts_enabled,
      stripe_connect_details_submitted: !!account.details_submitted,
      stripe_connect_onboarded_at: onboardedAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,artist_id" },
  );

  return {
    accountId,
    payoutsEnabled: !!account.payouts_enabled,
    detailsSubmitted: !!account.details_submitted,
    onboardedAt,
    ready,
    shopSplitPercent: shopSplit,
    artistSplitPercent: artistSplit,
  };
}

export async function getArtistConnectStatus(
  admin: SupabaseClient,
  organizationId: string,
  artistId: string,
): Promise<ArtistConnectStatus> {
  const { data } = await admin
    .from("artist_pos_splits")
    .select(
      "stripe_connect_account_id, stripe_connect_payouts_enabled, stripe_connect_details_submitted, stripe_connect_onboarded_at, shop_split_percent, artist_split_percent",
    )
    .eq("organization_id", organizationId)
    .eq("artist_id", artistId)
    .maybeSingle();

  const payoutsEnabled = !!data?.stripe_connect_payouts_enabled;
  const detailsSubmitted = !!data?.stripe_connect_details_submitted;

  return {
    accountId: data?.stripe_connect_account_id ?? null,
    payoutsEnabled,
    detailsSubmitted,
    onboardedAt: data?.stripe_connect_onboarded_at ?? null,
    ready: payoutsEnabled && detailsSubmitted,
    shopSplitPercent: data?.shop_split_percent != null ? Number(data.shop_split_percent) : null,
    artistSplitPercent: data?.artist_split_percent != null ? Number(data.artist_split_percent) : null,
  };
}

function connectAccountReadinessScore(account: Stripe.Account): number {
  return (
    (account.charges_enabled ? 8 : 0) +
    (account.payouts_enabled ? 4 : 0) +
    (account.details_submitted ? 2 : 0)
  );
}

/** Find Express accounts already created for this Velbok organization (metadata.organization_id). */
export async function findConnectAccountsForOrganization(
  stripe: Stripe,
  organizationId: string,
): Promise<Stripe.Account[]> {
  try {
    const result = await stripe.accounts.search({
      query: `metadata['organization_id']:'${organizationId}'`,
      limit: 20,
    });
    return result.data;
  } catch {
    return [];
  }
}

/** Reuse the stored account, or recover an existing Stripe account when the DB link is missing. */
export async function resolveConnectAccountId(
  stripe: Stripe,
  organizationId: string,
  storedAccountId: string | null | undefined,
): Promise<string | null> {
  if (storedAccountId) {
    try {
      await stripe.accounts.retrieve(storedAccountId);
      return storedAccountId;
    } catch {
      // Stored id is invalid — try metadata search below.
    }
  }

  const matches = await findConnectAccountsForOrganization(stripe, organizationId);
  if (!matches.length) return null;

  return [...matches].sort(
    (a, b) => connectAccountReadinessScore(b) - connectAccountReadinessScore(a),
  )[0].id;
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

  if (organizationId) {
    const { data: shop } = await admin
      .from("shop_settings")
      .select("legal_name, trading_name")
      .eq("organization_id", organizationId)
      .maybeSingle();
    const names = [shop?.legal_name, shop?.trading_name].filter((name): name is string => !!name?.trim());
    if (names.length) {
      const orFilter = names.map((name) => `name.ilike.${name},legal_name.ilike.${name}`).join(",");
      const { data: company } = await admin
        .from("companies")
        .select("id")
        .or(orFilter)
        .limit(1)
        .maybeSingle();
      if (company?.id) {
        await admin
          .from("companies")
          .update({ stripe_account_id: accountId, updated_at: new Date().toISOString() })
          .eq("id", company.id);
      }
    }
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

/** Throws with Stripe's message when the Connect platform cannot create Express accounts yet. */
export async function assertConnectPlatformReady(stripe: Stripe): Promise<void> {
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("platform-profile")) {
      throw new Error(
        "Stripe Connect platform profile is incomplete on your shop account. Open https://dashboard.stripe.com/settings/connect/platform-profile while logged into Inkaholics (acct_1TFFWdAxFvqjl4T2), review loss responsibilities, and save.",
      );
    }
    if (msg.includes("signed up for Connect")) {
      throw new Error(
        "Stripe Connect is not fully enabled on your shop account. Open https://dashboard.stripe.com/connect while logged into Inkaholics (not Velbok), choose Platform + Express, and finish setup.",
      );
    }
    throw e instanceof Error ? e : new Error(msg);
  }
}

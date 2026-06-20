import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@16.12.0";
import { stripeRequestOptions } from "./stripe-connect.ts";

const ZERO_DECIMAL_CURRENCIES = [
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
];

function toMinorUnits(amountMajor: number, currency: string): number {
  const cur = currency.toLowerCase();
  return ZERO_DECIMAL_CURRENCIES.includes(cur) ? Math.round(amountMajor) : Math.round(amountMajor * 100);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retrievePaymentIntentWithCharge(
  stripe: Stripe,
  paymentIntentId: string,
  stripeConnectAccountId: string | null,
): Promise<Stripe.PaymentIntent | null> {
  const opts = stripeRequestOptions(stripeConnectAccountId);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const pi = await stripe.paymentIntents.retrieve(
        paymentIntentId,
        { expand: ["latest_charge"] },
        opts,
      );
      const chargeId = typeof pi.latest_charge === "string"
        ? pi.latest_charge
        : pi.latest_charge?.id ?? null;
      if (chargeId) return pi;
    } catch (e) {
      if (attempt === 3) throw e;
    }
    await sleep(750 * (attempt + 1));
  }
  return null;
}

export type PosSplitTransferResult = {
  shopTransferId: string | null;
  artistTransferId: string | null;
  errors: string[];
  skipped: boolean;
};

/**
 * Shop POS split: direct charge on the shop connected account with application_fee_amount
 * (artist share). Shop keeps the remainder on their Connect balance; artist share is
 * transferred from the platform to the artist connected account.
 */
export async function executePosSplitTransfers(params: {
  admin: SupabaseClient;
  stripe: Stripe;
  saleId: string;
  paymentIntentId: string;
  stripeConnectAccountId?: string | null;
}): Promise<PosSplitTransferResult> {
  const { admin, stripe, saleId, paymentIntentId } = params;
  const result: PosSplitTransferResult = {
    shopTransferId: null,
    artistTransferId: null,
    errors: [],
    skipped: false,
  };

  const { data: sale, error: saleErr } = await admin
    .from("pos_sales")
    .select(
      "id, organization_id, artist_id, artist_amount, currency, stripe_artist_transfer_id",
    )
    .eq("id", saleId)
    .maybeSingle();

  if (saleErr || !sale) {
    result.errors.push(saleErr?.message || "POS sale not found");
    return result;
  }

  result.artistTransferId = sale.stripe_artist_transfer_id ?? null;

  const artistCentsNeeded = toMinorUnits(Number(sale.artist_amount) || 0, sale.currency || "gbp");
  if (artistCentsNeeded <= 0) {
    result.skipped = true;
    return result;
  }

  if (result.artistTransferId) {
    result.skipped = true;
    return result;
  }

  let stripeConnectAccountId = params.stripeConnectAccountId?.trim() || null;
  if (!stripeConnectAccountId) {
    const { data: org } = await admin
      .from("organizations")
      .select("stripe_connect_account_id")
      .eq("id", sale.organization_id)
      .maybeSingle();
    stripeConnectAccountId = org?.stripe_connect_account_id?.trim() || null;
  }

  let paymentIntent: Stripe.PaymentIntent | null;
  try {
    paymentIntent = await retrievePaymentIntentWithCharge(stripe, paymentIntentId, stripeConnectAccountId);
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
    return result;
  }

  if (!paymentIntent) {
    result.errors.push("PaymentIntent has no charge yet — transfers will retry via webhook");
    return result;
  }

  const chargeId = typeof paymentIntent.latest_charge === "string"
    ? paymentIntent.latest_charge
    : paymentIntent.latest_charge?.id ?? null;

  if (!chargeId) {
    result.errors.push("PaymentIntent has no charge yet — transfers will retry via webhook");
    return result;
  }

  const cur = (sale.currency || "gbp").toLowerCase();
  const transferGroup = paymentIntent.transfer_group || `pos_${saleId}`;
  const chargeModel = paymentIntent.metadata?.charge_model || "direct_application_fee";
  // Direct charges live on the shop Connect account — platform cannot use that charge id
  // as source_transaction. Artist share is funded from the application_fee on the platform.
  const usePlatformBalanceOnly = chargeModel === "direct_application_fee";

  let artistConnectId: string | null = null;
  if (sale.artist_id) {
    const { data: artistSplit } = await admin
      .from("artist_pos_splits")
      .select("stripe_connect_account_id")
      .eq("organization_id", sale.organization_id)
      .eq("artist_id", sale.artist_id)
      .maybeSingle();
    artistConnectId = artistSplit?.stripe_connect_account_id?.trim() || null;
  }

  if (!artistConnectId) {
    result.errors.push("Artist Stripe Connect account is not configured in Admin → POS");
  } else {
    const transferParams: Stripe.TransferCreateParams = {
      amount: artistCentsNeeded,
      currency: cur,
      destination: artistConnectId,
      transfer_group: transferGroup,
      metadata: {
        kind: "pos_artist_split",
        pos_sale_id: saleId,
        organization_id: sale.organization_id,
        artist_id: sale.artist_id,
        payment_intent_id: paymentIntentId,
        shop_connect_account_id: stripeConnectAccountId || "",
      },
    };

    if (!usePlatformBalanceOnly && chargeId) {
      transferParams.source_transaction = chargeId;
    }

    try {
      const idempotencyKey = usePlatformBalanceOnly
        ? `pos_artist_${saleId}_direct`
        : `pos_artist_${saleId}`;
      const transfer = await stripe.transfers.create(
        transferParams,
        { idempotencyKey },
      );
      result.artistTransferId = transfer.id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Backward-compatible retry if an older deploy sent a connected-account charge id.
      if (!usePlatformBalanceOnly && msg.includes("No such charge") && chargeId) {
        try {
          const transfer = await stripe.transfers.create(
            {
              amount: artistCentsNeeded,
              currency: cur,
              destination: artistConnectId,
              transfer_group: transferGroup,
              metadata: transferParams.metadata,
            },
            { idempotencyKey: `pos_artist_${saleId}_v2` },
          );
          result.artistTransferId = transfer.id;
        } catch (retryErr) {
          result.errors.push(
            `Artist transfer failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
          );
        }
      } else {
        result.errors.push(`Artist transfer failed: ${msg}`);
      }
    }
  }

  const patch: Record<string, string | null> = {};
  if (result.artistTransferId) patch.stripe_artist_transfer_id = result.artistTransferId;
  if (result.errors.length) {
    patch.stripe_transfer_error = result.errors.join("; ");
  } else if (result.artistTransferId) {
    patch.stripe_transfer_error = null;
  }

  if (Object.keys(patch).length) {
    await admin.from("pos_sales").update(patch).eq("id", saleId);
  }

  return result;
}

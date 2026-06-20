import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@16.12.0";
import { resolveOrganizationForUser } from "../_shared/organization.ts";
import {
  getActiveConnectAccount,
  getConnectStatusForOrg,
  stripeRequestOptions,
  canManageStripeConnect,
} from "../_shared/stripe-connect.ts";
import { createConnectStripe, getConnectStripeSecret, stripeSecretMode } from "../_shared/stripe-keys.ts";
import { getShopPaymentSettings, stripeMinimumChargeMajor } from "../_shared/shop-currency.ts";
import { mapShopCountryToStripe } from "../_shared/stripe-connect.ts";
import { callerHasPosAccess } from "../_shared/auth.ts";
import { executePosSplitTransfers } from "../_shared/pos-split-transfers.ts";

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

function bearerIsServiceRole(token: string, serviceKey: string): boolean {
  if (!token) return false;
  if (serviceKey && token === serviceKey) return true;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role === "service_role" && String(payload.iss ?? "").includes("supabase");
  } catch {
    return false;
  }
}

type PosLineItem = {
  serviceId?: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

const ZERO_DECIMAL_CURRENCIES = [
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
];

function toMinorUnits(amountMajor: number, currency: string): number {
  const cur = currency.toLowerCase();
  return ZERO_DECIMAL_CURRENCIES.includes(cur) ? Math.round(amountMajor) : Math.round(amountMajor * 100);
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
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";

    // Ops-only: service role may retry artist transfers for a sale (scripts / support).
    if (action === "retry_transfers" && bearerIsServiceRole(token, serviceKey)) {
      const saleId = typeof body.saleId === "string" ? body.saleId : null;
      if (!saleId) {
        return new Response(JSON.stringify({ error: "saleId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: sale } = await admin
        .from("pos_sales")
        .select("organization_id, stripe_payment_intent_id")
        .eq("id", saleId)
        .maybeSingle();

      if (!sale?.stripe_payment_intent_id) {
        return new Response(JSON.stringify({ error: "Sale has no payment intent" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const connect = await getActiveConnectAccount(admin, { organizationId: sale.organization_id });
      if (!connect) {
        return new Response(JSON.stringify({ error: "Stripe Connect is not ready" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const stripe = createConnectStripe();
      const transferResult = await executePosSplitTransfers({
        admin,
        stripe,
        saleId,
        paymentIntentId: sale.stripe_payment_intent_id,
        stripeConnectAccountId: connect.stripeConnectAccountId,
      });

      return new Response(JSON.stringify({ ok: true, transfers: transferResult }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authData.user;
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = await resolveOrganizationForUser(admin, user.id);
    if (!orgId) {
      return new Response(JSON.stringify({ error: "Organization not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const canUsePos = await callerHasPosAccess(admin, user.id);
    if (!canUsePos) {
      return new Response(JSON.stringify({ error: "Forbidden", reason: "pos_staff_only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const connect = await getActiveConnectAccount(admin, { organizationId: orgId });
    if (!connect) {
      return new Response(JSON.stringify({ error: "Stripe Connect is not ready", code: "connect_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = createConnectStripe();
    const stripeOpts = stripeRequestOptions(connect.stripeConnectAccountId);

    if (action === "connection_token") {
      let locationId = typeof body.locationId === "string" ? body.locationId.trim() : "";
      if (!locationId) {
        const { data: posSettings } = await admin
          .from("shop_pos_settings")
          .select("stripe_terminal_location_id")
          .eq("organization_id", orgId)
          .maybeSingle();
        locationId = posSettings?.stripe_terminal_location_id?.trim() || "";
      }

      if (!locationId) {
        return new Response(
          JSON.stringify({
            error: "Terminal location is not set up. Create one in Admin → POS checkout first.",
            code: "location_required",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      try {
        const tokenRes = await stripe.terminal.connectionTokens.create({ location: locationId }, stripeOpts);
        return new Response(JSON.stringify({ secret: tokenRes.secret, locationId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        const stripeMessage = e instanceof Error ? e.message : String(e);
        return new Response(
          JSON.stringify({
            error: `Stripe could not create a Terminal connection token: ${stripeMessage}`,
            code: "connection_token_failed",
            locationId,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    if (action === "terminal_config") {
      const mode = stripeSecretMode(getConnectStripeSecret());
      return new Response(JSON.stringify({ isTest: mode === "test" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "ensure_location") {
      const forceRecreate = body.forceRecreate === true;

      const saveLocationId = async (locationId: string) => {
        const { data: existingPos } = await admin
          .from("shop_pos_settings")
          .select("organization_id")
          .eq("organization_id", orgId)
          .maybeSingle();

        if (existingPos) {
          await admin
            .from("shop_pos_settings")
            .update({
              stripe_terminal_location_id: locationId,
              updated_at: new Date().toISOString(),
            })
            .eq("organization_id", orgId);
        } else {
          await admin.from("shop_pos_settings").insert({
            organization_id: orgId,
            stripe_terminal_location_id: locationId,
          });
        }
      };

      const createLocation = async () => {
        const { data: shop } = await admin
          .from("shop_settings")
          .select("shop_name, address_line1, city, postcode, country_code")
          .eq("organization_id", orgId)
          .maybeSingle();

        const country = mapShopCountryToStripe(shop?.country_code);
        const location = await stripe.terminal.locations.create(
          {
            display_name: shop?.shop_name || "Studio",
            address: {
              line1: shop?.address_line1 || "1 Main Street",
              city: shop?.city || "London",
              postal_code: shop?.postcode || "SW1A 1AA",
              country,
            },
            metadata: { organization_id: orgId },
          },
          stripeOpts,
        );
        await saveLocationId(location.id);
        return location.id;
      };

      const { data: posSettings } = await admin
        .from("shop_pos_settings")
        .select("stripe_terminal_location_id")
        .eq("organization_id", orgId)
        .maybeSingle();

      const storedId = posSettings?.stripe_terminal_location_id?.trim() || "";

      if (!forceRecreate && storedId) {
        try {
          await stripe.terminal.locations.retrieve(storedId, stripeOpts);
          return new Response(JSON.stringify({ locationId: storedId }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch {
          /* stale location — recreate below */
        }
      }

      const locationId = await createLocation();
      return new Response(JSON.stringify({ locationId, recreated: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create_payment_intent") {
      const sessionTotal = Number(body.sessionTotal ?? body.total);
      const depositCreditAmount = Math.max(0, Number(body.depositCreditAmount) || 0);
      const amountMajor = Math.max(0, Number(body.total));
      const currency = typeof body.currency === "string" ? body.currency.toLowerCase() : "gbp";
      const artistId = typeof body.artistId === "string" ? body.artistId : null;
      const items = Array.isArray(body.items) ? (body.items as PosLineItem[]) : [];
      const clientName = typeof body.clientName === "string" ? body.clientName.trim() : "";
      const shopAmount = Number(body.shopAmount) || 0;
      const artistAmount = Number(body.artistAmount) || 0;
      const shopSplitPercent = Number(body.shopSplitPercent) || 0;
      const artistSplitPercent = Number(body.artistSplitPercent) || 0;
      const subtotal = Number(body.subtotal) || 0;
      const taxAmount = Number(body.taxAmount) || 0;
      const gratuityAmount = Number(body.gratuityAmount) || 0;
      const bookingId = typeof body.bookingId === "string" ? body.bookingId.trim() : null;

      if (!artistId || items.length === 0) {
        return new Response(JSON.stringify({ error: "artistId and items are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const paymentSettings = await getShopPaymentSettings(admin, orgId);
      const minCharge = stripeMinimumChargeMajor(currency);

      if (bookingId) {
        const { data: bookingRow } = await admin
          .from("bookings")
          .select("id, artist_id, organization_id, deposit_paid, deposit_amount")
          .eq("id", bookingId)
          .maybeSingle();

        if (!bookingRow || bookingRow.organization_id !== orgId || bookingRow.artist_id !== artistId) {
          return new Response(JSON.stringify({ error: "Invalid booking for this payment" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (depositCreditAmount > 0) {
          if (!bookingRow.deposit_paid) {
            return new Response(JSON.stringify({ error: "Deposit has not been paid for this booking" }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          const maxCredit = Math.min(Number(bookingRow.deposit_amount) || 0, sessionTotal);
          if (depositCreditAmount > maxCredit + 0.01) {
            return new Response(JSON.stringify({ error: "Deposit credit exceeds paid deposit or session total" }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      } else if (depositCreditAmount > 0) {
        return new Response(JSON.stringify({ error: "Deposit credit requires a linked booking" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const expectedDue = Math.max(0, Math.round((sessionTotal - depositCreditAmount) * 100) / 100);
      if (Math.abs(amountMajor - expectedDue) > 0.02) {
        return new Response(JSON.stringify({ error: "Charge amount does not match session total minus deposit" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (amountMajor > 0 && amountMajor < minCharge) {
        return new Response(JSON.stringify({ error: `Minimum charge is ${minCharge} ${currency.toUpperCase()}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (amountMajor === 0) {
        const { data: saleRow, error: saleErr } = await admin
          .from("pos_sales")
          .insert({
            organization_id: orgId,
            artist_id: artistId,
            created_by: user.id,
            client_name: clientName || null,
            booking_id: bookingId || null,
            items,
            currency,
            subtotal,
            tax_amount: taxAmount,
            gratuity_amount: gratuityAmount,
            session_total: sessionTotal,
            deposit_credit_amount: depositCreditAmount,
            total: 0,
            shop_amount: shopAmount,
            artist_amount: artistAmount,
            shop_split_percent: shopSplitPercent,
            artist_split_percent: artistSplitPercent,
            status: "succeeded",
          })
          .select("id")
          .single();

        if (saleErr || !saleRow) {
          return new Response(JSON.stringify({ error: saleErr?.message || "Could not create sale record" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(
          JSON.stringify({ saleId: saleRow.id, zeroBalance: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const amountCents = toMinorUnits(amountMajor, currency);
      const artistCents = toMinorUnits(artistAmount, currency);

      if (artistCents > 0) {
        const { data: artistSplit } = await admin
          .from("artist_pos_splits")
          .select("stripe_connect_account_id")
          .eq("organization_id", orgId)
          .eq("artist_id", artistId)
          .maybeSingle();
        const artistConnectId = artistSplit?.stripe_connect_account_id?.trim();
        if (!artistConnectId) {
          return new Response(
            JSON.stringify({
              error: "Add the artist Stripe Connect account (acct_…) in Admin → POS → Artist overrides before taking a split payment.",
              code: "artist_connect_required",
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      const { data: saleRow, error: saleErr } = await admin
        .from("pos_sales")
        .insert({
          organization_id: orgId,
          artist_id: artistId,
          created_by: user.id,
          client_name: clientName || null,
          booking_id: bookingId || null,
          items,
          currency,
          subtotal,
          tax_amount: taxAmount,
          gratuity_amount: gratuityAmount,
          session_total: sessionTotal,
          deposit_credit_amount: depositCreditAmount,
          total: amountMajor,
          shop_amount: shopAmount,
          artist_amount: artistAmount,
          shop_split_percent: shopSplitPercent,
          artist_split_percent: artistSplitPercent,
          status: "pending",
        })
        .select("id")
        .single();

      if (saleErr || !saleRow) {
        return new Response(JSON.stringify({ error: saleErr?.message || "Could not create sale record" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const piParams: Stripe.PaymentIntentCreateParams = {
        amount: amountCents,
        currency,
        payment_method_types: ["card_present"],
        capture_method: "automatic",
        metadata: {
          kind: "pos",
          charge_model: "direct_application_fee",
          organization_id: orgId,
          artist_id: artistId,
          pos_sale_id: saleRow.id,
          booking_id: bookingId || "",
          deposit_credit: String(depositCreditAmount),
          session_total: String(sessionTotal),
          shop_amount: String(shopAmount),
          artist_amount: String(artistAmount),
          shop_connect_account_id: connect.stripeConnectAccountId,
        },
      };

      if (artistCents > 0) {
        piParams.application_fee_amount = artistCents;
      }

      const paymentIntent = await stripe.paymentIntents.create(piParams, stripeOpts);

      await admin
        .from("pos_sales")
        .update({ stripe_payment_intent_id: paymentIntent.id })
        .eq("id", saleRow.id);

      return new Response(
        JSON.stringify({
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          saleId: saleRow.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "complete_sale") {
      const saleId = typeof body.saleId === "string" ? body.saleId : null;
      const paymentIntentId = typeof body.paymentIntentId === "string" ? body.paymentIntentId : null;
      const readerId = typeof body.readerId === "string" ? body.readerId : null;
      const status = body.status === "failed" ? "failed" : body.status === "cancelled" ? "cancelled" : "succeeded";

      if (!saleId) {
        return new Response(JSON.stringify({ error: "saleId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await admin
        .from("pos_sales")
        .update({
          status,
          stripe_payment_intent_id: paymentIntentId,
          stripe_terminal_reader_id: readerId,
        })
        .eq("id", saleId)
        .eq("organization_id", orgId);

      let transferResult: Awaited<ReturnType<typeof executePosSplitTransfers>> | null = null;
      if (status === "succeeded" && paymentIntentId) {
        transferResult = await executePosSplitTransfers({
          admin,
          stripe,
          saleId,
          paymentIntentId,
          stripeConnectAccountId: connect.stripeConnectAccountId,
        });
      }

      return new Response(
        JSON.stringify({
          ok: true,
          transfers: transferResult
            ? {
              shopTransferId: transferResult.shopTransferId,
              artistTransferId: transferResult.artistTransferId,
              errors: transferResult.errors,
              skipped: transferResult.skipped,
            }
            : null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "retry_transfers") {
      const saleId = typeof body.saleId === "string" ? body.saleId : null;
      if (!saleId) {
        return new Response(JSON.stringify({ error: "saleId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: sale } = await admin
        .from("pos_sales")
        .select("stripe_payment_intent_id")
        .eq("id", saleId)
        .eq("organization_id", orgId)
        .maybeSingle();

      if (!sale?.stripe_payment_intent_id) {
        return new Response(JSON.stringify({ error: "Sale has no payment intent" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const transferResult = await executePosSplitTransfers({
        admin,
        stripe,
        saleId,
        paymentIntentId: sale.stripe_payment_intent_id,
        stripeConnectAccountId: connect.stripeConnectAccountId,
      });

      return new Response(
        JSON.stringify({
          ok: transferResult.errors.length === 0,
          transfers: {
            shopTransferId: transferResult.shopTransferId,
            artistTransferId: transferResult.artistTransferId,
            errors: transferResult.errors,
            skipped: transferResult.skipped,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "save_artist_split") {
      const canManage = await canManageStripeConnect(admin, user.id, orgId);
      if (!canManage) {
        return new Response(JSON.stringify({ error: "Forbidden", code: "org_admin_required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const artistId = typeof body.artistId === "string" ? body.artistId.trim() : "";
      const connectRaw = typeof body.stripeConnectAccountId === "string" ? body.stripeConnectAccountId.trim() : "";
      const shopSplitRaw = body.shopSplitPercent;

      if (!artistId) {
        return new Response(JSON.stringify({ error: "artistId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!connectRaw && (shopSplitRaw === null || shopSplitRaw === undefined || shopSplitRaw === "")) {
        return new Response(JSON.stringify({ error: "Enter a Connect account and/or shop split %" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (connectRaw && !connectRaw.startsWith("acct_")) {
        return new Response(JSON.stringify({ error: "Artist Connect account must start with acct_" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (connectRaw) {
        try {
          const account = await stripe.accounts.retrieve(connectRaw);
          if (account.metadata?.velbok_kind === "pos_artist") {
            if (account.metadata?.artist_id !== artistId || account.metadata?.organization_id !== orgId) {
              return new Response(JSON.stringify({ error: "That Connect account belongs to a different artist or studio." }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }
        } catch {
          return new Response(JSON.stringify({
            error: "That Connect account was not found on your studio's Stripe platform. Ask the artist to set up payouts under Settings, or create the account in Stripe Connect.",
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      let shopSplit = Number(shopSplitRaw);
      if (!Number.isFinite(shopSplit)) {
        const { data: posSettings } = await admin
          .from("shop_pos_settings")
          .select("shop_split_percent")
          .eq("organization_id", orgId)
          .maybeSingle();
        shopSplit = Number(posSettings?.shop_split_percent ?? 30);
      }

      if (shopSplit < 0 || shopSplit > 100) {
        return new Response(JSON.stringify({ error: "Shop split must be between 0 and 100" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const shop = Math.min(100, Math.max(0, shopSplit));
      const artist = 100 - shop;

      const { data: row, error: upsertErr } = await admin
        .from("artist_pos_splits")
        .upsert(
          {
            organization_id: orgId,
            artist_id: artistId,
            shop_split_percent: shop,
            artist_split_percent: artist,
            stripe_connect_account_id: connectRaw || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "organization_id,artist_id" },
        )
        .select("*")
        .single();

      if (upsertErr || !row) {
        return new Response(JSON.stringify({ error: upsertErr?.message || "Could not save artist split" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true, split: row }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete_artist_split") {
      const canManage = await canManageStripeConnect(admin, user.id, orgId);
      if (!canManage) {
        return new Response(JSON.stringify({ error: "Forbidden", code: "org_admin_required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const artistId = typeof body.artistId === "string" ? body.artistId.trim() : "";
      if (!artistId) {
        return new Response(JSON.stringify({ error: "artistId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: deleteErr } = await admin
        .from("artist_pos_splits")
        .delete()
        .eq("organization_id", orgId)
        .eq("artist_id", artistId);

      if (deleteErr) {
        return new Response(JSON.stringify({ error: deleteErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "connect_status") {
      const status = await getConnectStatusForOrg(admin, orgId);
      const { data: posSettings } = await admin
        .from("shop_pos_settings")
        .select("*")
        .eq("organization_id", orgId)
        .maybeSingle();

      return new Response(
        JSON.stringify({
          connect: status,
          posSettings: posSettings ?? null,
          stripeMode: stripeSecretMode(getConnectStripeSecret()),
          connectAccountId: status.accountId,
          terminalLocationId: posSettings?.stripe_terminal_location_id ?? null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "terminal_diagnose") {
      const { data: posSettings } = await admin
        .from("shop_pos_settings")
        .select("stripe_terminal_location_id, simulated_reader, enabled")
        .eq("organization_id", orgId)
        .maybeSingle();

      const storedLocationId = posSettings?.stripe_terminal_location_id?.trim() || "";
      const diagnostics: Record<string, unknown> = {
        connectAccountId: connect.stripeConnectAccountId,
        chargeModel: "direct_charge_application_fee",
        stripeMode: stripeSecretMode(getConnectStripeSecret()),
        simulatedReader: posSettings?.simulated_reader === true,
        posEnabled: posSettings?.enabled === true,
        storedLocationId: storedLocationId || null,
      };

      if (storedLocationId) {
        try {
          const location = await stripe.terminal.locations.retrieve(storedLocationId, stripeOpts);
          diagnostics.locationValid = true;
          diagnostics.locationDisplayName = location.display_name;
        } catch (e) {
          diagnostics.locationValid = false;
          diagnostics.locationError = e instanceof Error ? e.message : String(e);
        }
      } else {
        diagnostics.locationValid = false;
        diagnostics.locationError = "No terminal location saved";
      }

      try {
        const tokenParams: { location?: string } = {};
        if (storedLocationId) tokenParams.location = storedLocationId;
        const tokenRes = await stripe.terminal.connectionTokens.create(tokenParams, stripeOpts);
        diagnostics.connectionTokenOk = !!tokenRes.secret;
      } catch (e) {
        diagnostics.connectionTokenOk = false;
        diagnostics.connectionTokenError = e instanceof Error ? e.message : String(e);
      }

      try {
        const readers = await stripe.terminal.readers.list({ limit: 5 }, stripeOpts);
        diagnostics.registeredReaders = readers.data.map((r) => ({
          id: r.id,
          label: r.label,
          serialNumber: r.serial_number,
          status: r.status,
          deviceType: r.device_type,
        }));
      } catch (e) {
        diagnostics.registeredReadersError = e instanceof Error ? e.message : String(e);
      }

      return new Response(JSON.stringify(diagnostics), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

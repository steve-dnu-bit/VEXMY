import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@16.12.0";
import { resolveOrganizationForUser } from "../_shared/organization.ts";
import {
  getActiveConnectAccount,
  getConnectStatusForOrg,
  stripeRequestOptions,
} from "../_shared/stripe-connect.ts";
import { createConnectStripe, getConnectStripeSecret, stripeSecretMode } from "../_shared/stripe-keys.ts";
import { getShopPaymentSettings, stripeMinimumChargeMajor } from "../_shared/shop-currency.ts";
import { mapShopCountryToStripe } from "../_shared/stripe-connect.ts";

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

    const connect = await getActiveConnectAccount(admin, { organizationId: orgId });
    if (!connect) {
      return new Response(JSON.stringify({ error: "Stripe Connect is not ready", code: "connect_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = createConnectStripe();
    const stripeOpts = stripeRequestOptions(connect.stripeConnectAccountId);
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "connection_token") {
      const tokenRes = await stripe.terminal.connectionTokens.create({}, stripeOpts);
      return new Response(JSON.stringify({ secret: tokenRes.secret }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

      const zeroDecimal = ZERO_DECIMAL_CURRENCIES;
      const amountCents = toMinorUnits(amountMajor, currency);

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
          organization_id: orgId,
          artist_id: artistId,
          pos_sale_id: saleRow.id,
          booking_id: bookingId || "",
          deposit_credit: String(depositCreditAmount),
          session_total: String(sessionTotal),
          shop_amount: String(shopAmount),
          artist_amount: String(artistAmount),
        },
      };

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

      if (status === "succeeded" && paymentIntentId) {
        const { data: sale } = await admin
          .from("pos_sales")
          .select("artist_id, artist_amount, currency")
          .eq("id", saleId)
          .maybeSingle();

        if (sale?.artist_id && Number(sale.artist_amount) > 0) {
          const { data: artistSplit } = await admin
            .from("artist_pos_splits")
            .select("stripe_connect_account_id")
            .eq("organization_id", orgId)
            .eq("artist_id", sale.artist_id)
            .maybeSingle();

          const dest = artistSplit?.stripe_connect_account_id?.trim();
          if (dest) {
            const cur = (sale.currency || "gbp").toLowerCase();
            const artistCents = toMinorUnits(Number(sale.artist_amount), cur);
            if (artistCents > 0) {
              try {
                await stripe.transfers.create(
                  { amount: artistCents, currency: cur, destination: dest },
                  stripeOpts,
                );
              } catch {
                /* transfer optional — sale still recorded */
              }
            }
          }
        }
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

      return new Response(JSON.stringify({ connect: status, posSettings: posSettings ?? null }), {
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

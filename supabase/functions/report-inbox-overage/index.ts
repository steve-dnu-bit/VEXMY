import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@16.12.0";
import { jsonResponse, requireCronAuth } from "../_shared/auth.ts";

const OVERAGE_PENCE = 6; // £0.06 per message

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
      },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) return jsonResponse({ error: "Server misconfigured" }, 500);

    const cronAuth = requireCronAuth(req);
    if ("status" in cronAuth) return jsonResponse(cronAuth.body, cronAuth.status);

    const admin = createClient(supabaseUrl, serviceKey);
    const periodMonth = new Date();
    periodMonth.setUTCDate(1);
    periodMonth.setUTCHours(0, 0, 0, 0);
    const periodKey = periodMonth.toISOString().slice(0, 10);

    const { data: usageRows, error } = await admin
      .from("inbox_api_usage")
      .select("organization_id, overage_count, overage_reported_count")
      .eq("period_month", periodKey)
      .gt("overage_count", 0);

    if (error) return jsonResponse({ error: error.message }, 500);

    const stripe = stripeSecret ? new Stripe(stripeSecret) : null;
    const results: Array<{ organizationId: string; billed: number; amountPence: number }> = [];

    for (const row of usageRows || []) {
      const orgId = row.organization_id as string;
      const overage = Number(row.overage_count ?? 0);
      const reported = Number(row.overage_reported_count ?? 0);
      const delta = overage - reported;
      if (delta <= 0) continue;

      const { data: org } = await admin
        .from("organizations")
        .select("stripe_customer_id")
        .eq("id", orgId)
        .maybeSingle();

      const customerId = org?.stripe_customer_id ?? null;
      const amountPence = delta * OVERAGE_PENCE;

      if (stripe && customerId) {
        await stripe.invoiceItems.create({
          customer: customerId,
          amount: amountPence,
          currency: "gbp",
          description: `Inbox API overage (${delta} messages @ £0.06)`,
          metadata: {
            organization_id: orgId,
            period_month: periodKey,
            overage_messages: String(delta),
          },
        });
      }

      await admin
        .from("inbox_api_usage")
        .update({ overage_reported_count: overage, updated_at: new Date().toISOString() })
        .eq("organization_id", orgId)
        .eq("period_month", periodKey);

      results.push({ organizationId: orgId, billed: delta, amountPence });
    }

    return jsonResponse({ ok: true, period: periodKey, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});

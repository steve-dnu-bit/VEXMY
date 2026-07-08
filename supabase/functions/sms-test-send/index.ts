import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { jsonCorsHeaders, jsonResponse, requireCronAuth } from "../_shared/auth.ts";
import { loadChannelCredentials, sendTwilioMessage } from "../_shared/inbox-webhook.ts";
import { normalizeSmsE164 } from "../_shared/phone-normalize.ts";
import { buildAppointmentReminderSms } from "../_shared/reminder-sms.ts";
import { getShopBrandingForOrganization } from "../_shared/branding.ts";

const corsHeaders = jsonCorsHeaders;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronDenied = requireCronAuth(req);
  if (cronDenied) return cronDenied;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) return jsonResponse({ error: "Server misconfigured" }, 500);

    const body = await req.json().catch(() => ({}));
    const organizationId = typeof body.organization_id === "string" ? body.organization_id.trim() : "";
    const toRaw = typeof body.to === "string" ? body.to.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!organizationId || !toRaw) {
      return jsonResponse({ error: "organization_id and to are required" }, 400);
    }

    const to = normalizeSmsE164(toRaw);
    if (!to) return jsonResponse({ error: "Invalid phone number" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);
    const creds = await loadChannelCredentials(admin, organizationId, "sms");
    if (!creds) return jsonResponse({ error: "SMS not connected for organization" }, 400);

    const brand = await getShopBrandingForOrganization(admin, organizationId);
    const smsBody =
      message ||
      buildAppointmentReminderSms(
        {
          id: "test",
          client_name: "Test",
          client_email: null,
          client_phone: to,
          artistName: "Artist",
          booking_type: "session",
          status: "confirmed",
          starts_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          ends_at: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
        },
        "en",
        brand,
      );

    await sendTwilioMessage(creds, to, smsBody, false);

    return jsonResponse({ ok: true, to, preview: smsBody.slice(0, 160) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: msg }, 500);
  }
});

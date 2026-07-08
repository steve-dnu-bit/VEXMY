import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  callerHasStaffAccess,
  jsonResponse,
  requireAuthenticatedUser,
} from "../_shared/auth.ts";
import { isInboxChannelAllowedForOrg } from "../_shared/inbox-limits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_CHANNELS = new Set(["whatsapp", "instagram", "facebook", "email", "sms"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) return jsonResponse({ error: "Server misconfigured" }, 500);

    const admin = createClient(supabaseUrl, serviceKey);
    const auth = await requireAuthenticatedUser(admin, req);
    if ("status" in auth) return jsonResponse(auth.body, auth.status);

    const canUse = await callerHasStaffAccess(admin, auth.user.id);
    if (!canUse) return jsonResponse({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "connect";
    const channel = typeof body.channel === "string" ? body.channel.toLowerCase().trim() : "";
    if (!ALLOWED_CHANNELS.has(channel)) return jsonResponse({ error: "Invalid channel" }, 400);

    const { data: orgId } = await admin.rpc("resolve_user_organization_id", { _user_id: auth.user.id });
    if (!orgId) return jsonResponse({ error: "No organization found" }, 400);

    const isSmsChannel = channel === "sms";
    if (!isSmsChannel) {
      const { data: hasInbox } = await admin.rpc("org_plan_has_feature", {
        _org_id: orgId,
        _feature: "staff_inbox",
      });
      if (!hasInbox) return jsonResponse({ error: "Unified inbox not included on your plan" }, 403);
    } else {
      const { data: hasReminders } = await admin.rpc("org_plan_has_feature", {
        _org_id: orgId,
        _feature: "reminders",
      });
      if (!hasReminders) {
        return jsonResponse({ error: "SMS requires an active subscription with reminders" }, 403);
      }
    }

    if (action === "disconnect") {
      await admin
        .from("channel_connections")
        .delete()
        .eq("organization_id", orgId)
        .eq("channel", channel);
      if (channel !== "email") {
        await admin
          .from("shop_settings")
          .update({ inbox_primary_channel: null })
          .eq("organization_id", orgId)
          .eq("inbox_primary_channel", channel);
      }
      return jsonResponse({ ok: true, disconnected: channel });
    }

    const allowed = await isInboxChannelAllowedForOrg(admin, orgId as string, channel);
    if (!allowed) {
      return jsonResponse({ error: "Channel not allowed on your plan or primary channel already set" }, 403);
    }

    const credentials = body.credentials;
    if (!credentials || typeof credentials !== "object") {
      return jsonResponse({ error: "credentials object required" }, 400);
    }

    const { data: activeSocial } = await admin
      .from("channel_connections")
      .select("channel")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .neq("channel", "email");

    const { data: maxChannelsRaw } = await admin.rpc("org_plan_feature_number", {
      _org_id: orgId,
      _feature: "inbox_max_channels",
    });
    const maxChannels = Number(maxChannelsRaw ?? 0);
    const socialCount = (activeSocial || []).filter((r: { channel: string }) => r.channel !== channel).length;

    if (channel !== "email" && maxChannels === 1 && socialCount > 0 && channel !== "sms") {
      return jsonResponse({ error: "Studio plan allows one social channel. Disconnect the current channel first." }, 403);
    }

    const { error: upsertErr } = await admin.from("channel_connections").upsert(
      {
        user_id: auth.user.id,
        organization_id: orgId,
        channel,
        credentials,
        is_active: true,
      },
      { onConflict: "organization_id,channel" },
    );
    if (upsertErr) return jsonResponse({ error: upsertErr.message }, 500);

    if (channel !== "email" && maxChannels === 1) {
      await admin
        .from("shop_settings")
        .update({ inbox_primary_channel: channel })
        .eq("organization_id", orgId);
    }

    return jsonResponse({ ok: true, channel });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import {

  callerHasStaffAccess,

  jsonResponse,

  requireAuthenticatedUser,

} from "../_shared/auth.ts";

import { getShopBrandingForOrganization } from "../_shared/branding.ts";

import { requireEmailDeliveryConfig, sendTransactionalEmail } from "../_shared/email.ts";

import { claimInboxMessageQuota, isInboxChannelAllowedForOrg } from "../_shared/inbox-limits.ts";

import {

  loadChannelCredentials,

  sendMetaMessage,

  sendTwilioMessage,

} from "../_shared/inbox-webhook.ts";



const corsHeaders = {

  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",

};



const REPLY_CHANNELS = new Set(["email", "whatsapp", "instagram", "facebook", "sms"]);



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

    const organizationId = typeof body.organizationId === "string" ? body.organizationId : null;

    const channel = typeof body.channel === "string" ? body.channel.toLowerCase() : "email";

    const recipient = typeof body.recipient === "string" ? body.recipient.trim() : "";

    const recipientName = typeof body.recipientName === "string" ? body.recipientName.trim() : "Client";

    const text = typeof body.body === "string" ? body.body.trim() : "";



    if (!organizationId || !recipient || !text) {

      return jsonResponse({ error: "organizationId, recipient, and body are required" }, 400);

    }



    if (!REPLY_CHANNELS.has(channel)) {

      return jsonResponse({ error: "Unsupported channel" }, 400);

    }



    const { data: memberOk } = await admin.rpc("is_org_member", {

      _org_id: organizationId,

      _user_id: auth.user.id,

    });

    if (!memberOk) return jsonResponse({ error: "Forbidden" }, 403);



    const channelAllowed = await isInboxChannelAllowedForOrg(admin, organizationId, channel);

    if (!channelAllowed) return jsonResponse({ error: "Channel not allowed on plan" }, 403);



    const quota = await claimInboxMessageQuota(admin, organizationId, "outbound");

    if (!quota.allowed) {

      return jsonResponse({ error: quota.error || "monthly_cap_reached", quota }, 429);

    }



    const branding = await getShopBrandingForOrganization(admin, organizationId);
    const shopName = branding.shopName || "Velbok";



    if (channel === "email") {

      requireEmailDeliveryConfig();

      const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;">

        <p style="white-space:pre-wrap;">${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>

        <p style="color:#666;font-size:12px;margin-top:16px;">— ${shopName}</p>

      </div>`;

      await sendTransactionalEmail({

        to: recipient,

        subject: `Message from ${shopName}`,

        html,

        fromKind: "notification",

      });

    } else if (channel === "whatsapp") {

      const creds = await loadChannelCredentials(admin, organizationId, "whatsapp");

      if (!creds) return jsonResponse({ error: "WhatsApp not connected" }, 400);

      await sendTwilioMessage(creds, recipient, text, true);

    } else if (channel === "sms") {

      const creds = await loadChannelCredentials(admin, organizationId, "sms");

      if (!creds) return jsonResponse({ error: "SMS not connected" }, 400);

      await sendTwilioMessage(creds, recipient, text, false);

    } else if (channel === "instagram" || channel === "facebook") {

      const creds = await loadChannelCredentials(admin, organizationId, channel);

      if (!creds) return jsonResponse({ error: `${channel} not connected` }, 400);

      await sendMetaMessage(creds, recipient, text);

    }



    const { data: profile } = await admin

      .from("profiles")

      .select("display_name")

      .eq("user_id", auth.user.id)

      .maybeSingle();



    const senderName = profile?.display_name?.trim() || shopName;



    const { error: insertErr } = await admin.from("messages").insert({

      organization_id: organizationId,

      channel,

      direction: "outbound",

      sender_name: senderName,

      sender_id: recipient,

      message_text: text,

      is_read: true,

      metadata: { sent_by: auth.user.id, reply_to: recipient, recipient_name: recipientName },

    });

    if (insertErr) return jsonResponse({ error: insertErr.message }, 500);



    return jsonResponse({ ok: true, quota });

  } catch (error) {

    const message = error instanceof Error ? error.message : "Unexpected error";

    return jsonResponse({ error: message }, 500);

  }

});


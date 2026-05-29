import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getShopBranding } from "../_shared/branding.ts";
import { requireSmtpConfig, sendTransactionalEmail, siteUrl } from "../_shared/email.ts";
import { buildChatUpdateEmail } from "../_shared/email-templates.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = parseBearerJwt(req);
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized", reason: "missing_bearer_token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const sender = authData.user;
    if (authError || !sender) {
      return new Response(JSON.stringify({ error: "Unauthorized", reason: "invalid_or_expired_token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const threadId = typeof body.threadId === "string" ? body.threadId : null;
    const previewTextRaw = typeof body.previewText === "string" ? body.previewText : "There is a new message in your chat.";
    const previewText = previewTextRaw.slice(0, 280);
    if (!threadId) {
      return new Response(JSON.stringify({ error: "threadId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: thread, error: threadError } = await admin
      .from("chat_threads")
      .select("id, artist_id, customer_id")
      .eq("id", threadId)
      .single();
    if (threadError || !thread) {
      return new Response(JSON.stringify({ error: threadError?.message || "Thread not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const senderIsMember = sender.id === thread.artist_id || sender.id === thread.customer_id;
    if (!senderIsMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recipientId = sender.id === thread.artist_id ? thread.customer_id : thread.artist_id;
    const { data: recipientProfile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("user_id", recipientId)
      .maybeSingle();
    const { data: senderProfile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("user_id", sender.id)
      .maybeSingle();

    const { data: recipientAuth, error: recipientAuthError } = await admin.auth.admin.getUserById(recipientId);
    const recipientEmail = recipientAuth.user?.email ?? null;
    if (recipientAuthError || !recipientEmail) {
      return new Response(JSON.stringify({ error: "Recipient email not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = siteUrl();
    const isArtistRecipient = recipientId === thread.artist_id;
    const chatPath = isArtistRecipient
      ? `/inbox?customerId=${encodeURIComponent(thread.customer_id)}`
      : "/account/chats";
    const chatUrl = `${baseUrl}${chatPath}`;

    const senderName = senderProfile?.display_name || sender.email || "Someone";
    const recipientName = recipientProfile?.display_name || "there";
    const brand = getShopBranding();

    const html = buildChatUpdateEmail({
      recipientName,
      senderName,
      previewText,
      chatUrl,
    });

    await sendTransactionalEmail({
      smtp: requireSmtpConfig(),
      to: recipientEmail,
      subject: `New chat update — ${brand.shopName}`,
      html,
    });

    return new Response(JSON.stringify({ ok: true, recipientEmail }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

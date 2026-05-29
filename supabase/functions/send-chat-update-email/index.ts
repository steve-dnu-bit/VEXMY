import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import nodemailer from "npm:nodemailer@6.9.15";
import { emailBrandHeader, getShopBranding } from "../_shared/branding.ts";

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

async function sendEmail(params: {
  host: string | null;
  port: string | null;
  username: string | null;
  password: string | null;
  from: string | null;
  to: string;
  subject: string;
  html: string;
}) {
  const { host, port, username, password, from, to, subject, html } = params;
  if (!host || !port || !username || !password || !from) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and EMAIL_FROM.");
  }
  const portNum = Number(port);
  if (!Number.isFinite(portNum)) throw new Error("SMTP_PORT must be a number.");

  const transporter = nodemailer.createTransport({
    host,
    port: portNum,
    secure: portNum === 465,
    auth: { user: username, pass: password },
    requireTLS: portNum !== 465,
  });

  await transporter.sendMail({
    from,
    to,
    subject,
    html,
  });
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

    const smtpHost = Deno.env.get("SMTP_HOST") ?? null;
    const smtpPort = Deno.env.get("SMTP_PORT") ?? null;
    const smtpUser = Deno.env.get("SMTP_USER") ?? null;
    const smtpPass = Deno.env.get("SMTP_PASS") ?? Deno.env.get("SMTP_PASSWORD") ?? null;
    const emailFrom = Deno.env.get("EMAIL_FROM") ?? Deno.env.get("SMTP_FROM") ?? null;
    const siteUrl = (Deno.env.get("SITE_URL") || "http://localhost:5173").replace(/\/$/, "");

    const isArtistRecipient = recipientId === thread.artist_id;
    const chatPath = isArtistRecipient
      ? `/inbox?customerId=${encodeURIComponent(thread.customer_id)}`
      : "/account/chats";
    const chatUrl = `${siteUrl}${chatPath}`;

    const senderName = senderProfile?.display_name || sender.email || "Someone";
    const recipientName = recipientProfile?.display_name || "there";

    const brand = getShopBranding();
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.55;color:#1f1f1f;background:#f2f2f2;padding:28px 12px;">
        <div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #e7e7e7;border-radius:12px;overflow:hidden;">
          <div style="background:#121212;padding:20px 24px;text-align:center;">
            ${emailBrandHeader(brand)}
            <div style="font-size:13px;color:#d4d4d4;margin-top:4px;">New Chat Update</div>
          </div>
          <div style="padding:22px;">
            <p style="margin:0 0 12px;font-size:15px;">Hi ${recipientName},</p>
            <p style="margin:0 0 14px;font-size:14px;"><strong>${senderName}</strong> has posted a new chat update.</p>
            <p style="margin:0 0 14px;font-size:14px;background:#faf7ea;border:1px solid #efe1b2;border-radius:8px;padding:10px 12px;">${previewText}</p>
            <p style="margin:18px 0;">
              <a href="${chatUrl}" style="display:inline-block;background:#f4c24d;color:#121212;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:8px;">Open chat</a>
            </p>
            <p style="margin:8px 0 0;font-size:12px;color:#5c5c5c;">If the button does not work, copy this link: <a href="${chatUrl}">${chatUrl}</a></p>
            <p style="margin:14px 0 0;font-size:13px;color:#555;">Please sign in first if prompted.</p>
          </div>
        </div>
      </div>
    `;

    await sendEmail({
      host: smtpHost,
      port: smtpPort,
      username: smtpUser,
      password: smtpPass,
      from: emailFrom,
      to: recipientEmail,
      subject: `New chat update - ${brand.shopName}`,
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

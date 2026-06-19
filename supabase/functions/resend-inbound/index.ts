import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendTransactionalEmail } from "../_shared/email.ts";
import {
  emailBodyText,
  fetchReceivedEmail,
  parseEmailAddress,
  type ResendInboundEvent,
  verifyResendWebhook,
} from "../_shared/resend-inbound.ts";
import { claimInboxMessageQuota, isInboxChannelAllowedForOrg } from "../_shared/inbox-limits.ts";

function inboundDomain(): string {
  return (Deno.env.get("RESEND_INBOUND_DOMAIN") ?? "velbok.com").trim().toLowerCase();
}

function matchesInboundDomain(addresses: string[] | undefined): boolean {
  const domain = inboundDomain();
  if (!addresses?.length) return false;
  return addresses.some((raw) => {
    const { email } = parseEmailAddress(raw);
    return email.endsWith(`@${domain}`);
  });
}

function forwardTarget(): string | null {
  const explicit = (Deno.env.get("RESEND_INBOUND_FORWARD_TO") ?? "").trim();
  const candidate = explicit || (Deno.env.get("SHOP_SUPPORT_EMAIL") ?? "").trim();
  if (!candidate) return null;

  const { email } = parseEmailAddress(candidate);
  // support@velbok.com etc. are receive-only — forwarding there loops on the same MX.
  if (email.endsWith(`@${inboundDomain()}`)) return null;
  return email;
}

async function forwardInboundEmail(email: Awaited<ReturnType<typeof fetchReceivedEmail>>): Promise<void> {
  const to = forwardTarget();
  if (!to) return;

  const body = emailBodyText(email);
  const fromLine = email.from;
  const subject = email.subject?.trim() || "(No subject)";
  const html = email.html?.trim()
    ? `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;">
        <p style="margin:0 0 12px;color:#666;">Forwarded from <strong>${fromLine}</strong> via ${inboundDomain()}</p>
        ${email.html}
      </div>`
    : `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;">
        <p style="margin:0 0 12px;color:#666;">Forwarded from <strong>${fromLine}</strong> via ${inboundDomain()}</p>
        <pre style="white-space:pre-wrap;font-family:inherit;">${body}</pre>
      </div>`;

  await sendTransactionalEmail({
    to,
    subject: `Fwd: ${subject}`,
    html,
    replyTo: parseEmailAddress(fromLine).email,
    fromKind: "notification",
  });
}

async function resolveInboundOrganizationId(
  admin: ReturnType<typeof createClient>,
): Promise<string | null> {
  const { count } = await admin.from("organizations").select("id", { count: "exact", head: true });
  if (count === 1) {
    const { data } = await admin.from("organizations").select("id").limit(1).maybeSingle();
    return data?.id ?? null;
  }
  const { data: shop } = await admin
    .from("shop_settings")
    .select("organization_id")
    .not("organization_id", "is", null)
    .limit(1)
    .maybeSingle();
  return shop?.organization_id ?? null;
}

async function storeInboundMessage(
  admin: ReturnType<typeof createClient>,
  organizationId: string,
  event: ResendInboundEvent,
  email: Awaited<ReturnType<typeof fetchReceivedEmail>>,
): Promise<{ stored: boolean; messageId?: string; skipped?: string }> {
  const emailId = event.data?.email_id ?? email.id;
  if (!emailId) throw new Error("Missing email_id");

  const { data: existing } = await admin
    .from("messages")
    .select("id")
    .contains("metadata", { resend_email_id: emailId })
    .maybeSingle();

  if (existing?.id) {
    return { stored: false, messageId: existing.id };
  }

  const sender = parseEmailAddress(email.from);
  const body = emailBodyText(email);
  const toAddresses = email.to ?? event.data?.to ?? [];
  const subject = email.subject ?? event.data?.subject ?? null;

  const { data: inserted, error } = await admin
    .from("messages")
    .insert({
      organization_id: organizationId,
      channel: "email",
      direction: "inbound",
      sender_name: sender.name,
      sender_id: sender.email,
      message_text: subject ? `${subject}\n\n${body}` : body,
      is_read: false,
      metadata: {
        resend_email_id: emailId,
        resend_message_id: email.message_id ?? event.data?.message_id ?? null,
        subject,
        to: toAddresses,
        cc: event.data?.cc ?? [],
        from: email.from,
        inbound_domain: inboundDomain(),
        attachments: (email.attachments ?? event.data?.attachments ?? []).map((a) => ({
          id: a.id,
          filename: a.filename,
          content_type: a.content_type,
        })),
        received_at: event.created_at ?? event.data?.created_at ?? new Date().toISOString(),
      },
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return { stored: true, messageId: inserted.id };
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return new Response("Server misconfigured", { status: 500 });
    }

    const rawBody = await req.text();
    const event = verifyResendWebhook(rawBody, req);

    if (event.type !== "email.received") {
      return new Response(JSON.stringify({ received: true, ignored: event.type }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const emailId = event.data?.email_id;
    if (!emailId) {
      return new Response("Missing email_id", { status: 400 });
    }

    if (!matchesInboundDomain(event.data?.to)) {
      console.warn("Inbound email ignored: recipient not on configured domain", {
        to: event.data?.to,
        domain: inboundDomain(),
      });
      return new Response(JSON.stringify({ received: true, ignored: "recipient_domain" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const email = await fetchReceivedEmail(emailId);

    // Always forward platform addresses (support@, privacy@, …) to a real inbox when configured.
    let forwarded = false;
    let forwardError: string | undefined;
    if (forwardTarget()) {
      try {
        await forwardInboundEmail(email);
        forwarded = true;
      } catch (e) {
        forwardError = e instanceof Error ? e.message : String(e);
        console.error("Inbound email forward failed:", forwardError);
      }
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const organizationId = await resolveInboundOrganizationId(admin);

    let stored: { stored: boolean; messageId?: string } = { stored: false };
    let inboxSkipped: string | undefined;

    if (!organizationId) {
      inboxSkipped = "no_organization";
    } else {
      const emailAllowed = await isInboxChannelAllowedForOrg(admin, organizationId, "email");
      if (!emailAllowed) {
        inboxSkipped = "plan_no_inbox_email";
      } else {
        const quota = await claimInboxMessageQuota(admin, organizationId, "inbound");
        if (!quota.allowed) {
          inboxSkipped = "monthly_cap_reached";
        } else {
          stored = await storeInboundMessage(admin, organizationId, event, email);
        }
      }
    }

    return new Response(
      JSON.stringify({
        received: true,
        email_id: emailId,
        stored: stored.stored,
        message_id: stored.messageId,
        forwarded,
        forward_error: forwardError,
        inbox_skipped: inboxSkipped,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("resend-inbound error:", message);
    return new Response(message, { status: 400 });
  }
});

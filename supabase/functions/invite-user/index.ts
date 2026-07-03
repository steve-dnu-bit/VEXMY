import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  callerHasStaffAccess,
  callerIsAdmin,
  jsonCorsHeaders,
  jsonResponse,
  requireAuthenticatedUser,
} from "../_shared/auth.ts";
import { getShopBranding } from "../_shared/branding.ts";
import { getEmailDeliveryStatus, requireEmailDeliveryConfig, sendTransactionalEmail } from "../_shared/email.ts";

const corsHeaders = jsonCorsHeaders;

function withCustomerMigrationHint(message: string, inviteType: string): string {
  if (inviteType !== "customer") return message;
  const m = message.toLowerCase();
  if (
    m.includes("customer") ||
    m.includes("app_role") ||
    m.includes("invalid input value for enum") ||
    m.includes("permission_role_defaults")
  ) {
    return `${message} — Customer invite schema may be missing on this Supabase project. Run latest migrations (including customer role/defaults).`;
  }
  return message;
}

async function sendInviteEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  requireEmailDeliveryConfig();
  await sendTransactionalEmail({
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildInviteEmailHtml(params: {
  roleLabel: string;
  heading: string;
  intro: string;
  steps: string[];
  buttonLabel: string;
  magicLink: string;
}) {
  const { roleLabel, heading, intro, steps, buttonLabel, magicLink } = params;
  const safeLink = escapeHtml(magicLink);
  const stepsHtml = steps
    .map(
      (s, idx) => `
          <tr>
            <td width="28" valign="top" style="padding:0 0 12px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="22" height="22" align="center" valign="middle" style="width:22px;height:22px;background:#f4c24d;border-radius:11px;font-size:11px;font-weight:700;color:#1b1b1b;line-height:22px;text-align:center;">
                    ${idx + 1}
                  </td>
                </tr>
              </table>
            </td>
            <td valign="top" style="padding:0 0 12px 8px;font-size:13px;line-height:1.55;color:#d7d7d7;">
              ${escapeHtml(s)}
            </td>
          </tr>`,
    )
    .join("");

  const brand = getShopBranding();
  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:0;background:#07070a;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#07070a;font-family:Arial,Helvetica,sans-serif;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:100%;max-width:600px;border:1px solid #26262d;border-radius:14px;background:#0f0f14;">
            <tr>
              <td align="center" style="padding:28px 24px 20px;background:#141419;text-align:center;border-bottom:1px solid #2a2a31;">
                <p style="margin:0;font-size:32px;font-weight:900;letter-spacing:1px;color:#f4c24d;line-height:1.1;">${escapeHtml(brand.shopName.toUpperCase())}</p>
                <p style="margin:8px 0 0;font-size:12px;letter-spacing:0.35px;color:#c7c7c7;text-transform:uppercase;">${escapeHtml(roleLabel)}</p>
              </td>
            </tr>

            <tr>
              <td style="padding:24px 26px 8px;">
                <h1 style="margin:0 0 10px;color:#f4c24d;font-size:24px;line-height:1.25;font-weight:800;">${escapeHtml(heading)}</h1>
                <p style="margin:0;color:#dadbe3;font-size:14px;line-height:1.65;">${escapeHtml(intro)}</p>
              </td>
            </tr>

            <tr>
              <td style="padding:14px 26px 8px;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #2d2d36;border-radius:12px;background:linear-gradient(180deg,#121219,#0d0d12);">
                  <tr>
                    <td style="padding:14px 16px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                        ${stepsHtml}
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:16px 26px 20px;text-align:center;">
                <table role="presentation" cellpadding="0" cellspacing="0" align="center">
                  <tr>
                    <td align="center" bgcolor="#e5b247" style="border-radius:999px;background-color:#e5b247;">
                      <a href="${magicLink}" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:800;color:#1a1a1a;text-decoration:none;border-radius:999px;">${escapeHtml(buttonLabel)}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:10px 26px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #2d2d36;border-radius:10px;background:#0a0a0f;">
                  <tr>
                    <td style="padding:10px 12px;">
                      <p style="margin:0 0 6px;color:#a3a5b1;font-size:11px;letter-spacing:.25px;text-transform:uppercase;">Magic Link</p>
                      <p style="margin:0;color:#e8e9f1;font-size:12px;line-height:1.55;word-break:break-all;">${safeLink}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:12px 26px 24px;">
                <p style="margin:0;color:#a1a3af;font-size:11px;line-height:1.6;">
                  This link is single-use and time-limited for your security. If the button does not open, copy and paste the link above into your browser.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;
}

function buildCustomerInviteHtml(params: { magicLink: string }) {
  const { magicLink } = params;
  const brand = getShopBranding();
  return buildInviteEmailHtml({
    roleLabel: "Customer Portal Invite",
    heading: `Welcome to ${brand.shopName}`,
    intro:
      "You have been invited to your customer portal. Use your magic link to access your account and complete your profile setup.",
    steps: [
      "Open your magic link securely.",
      "Create your password and confirm your profile details.",
      "View bookings, deposits, invoices, and messages in one place.",
    ],
    buttonLabel: "Open Customer Portal",
    magicLink,
  });
}

function buildArtistInviteHtml(params: { magicLink: string }) {
  const { magicLink } = params;
  const brand = getShopBranding();
  return buildInviteEmailHtml({
    roleLabel: "Artist Portal Invite",
    heading: `You are invited to ${brand.shopName}`,
    intro:
      "Your artist account is ready. Use this magic link to access the app and complete your profile details before taking bookings.",
    steps: [
      "Open your magic link to activate access.",
      "Set your profile details, media, and contact info.",
      "Manage schedule, bookings, messages, and customer workflow.",
    ],
    buttonLabel: "Open Artist Hub",
    magicLink,
  });
}

function isExistingUserError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("already registered") ||
    m.includes("already been registered") ||
    m.includes("email address has already") ||
    m.includes("user already exists") ||
    m.includes("email_exists") ||
    m.includes("user already registered")
  );
}

async function resolveInviterOrgId(
  adminClient: ReturnType<typeof createClient>,
  inviterUserId: string,
): Promise<string | null> {
  const { data: resolvedOrgId } = await adminClient.rpc("get_user_organization_id", {
    _user_id: inviterUserId,
  });
  if (resolvedOrgId) return resolvedOrgId as string;
  const { data: soleOrg } = await adminClient.from("organizations").select("id").limit(1).maybeSingle();
  return soleOrg?.id ?? null;
}

const ARTIST_ALREADY_IN_STUDIO_MSG =
  "This person is still linked to another studio. They must be released from that shop before they can join yours as an artist.";

async function findUserIdByEmail(
  adminClient: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  const { data: listed, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const match = listed.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return match?.id ?? null;
}

async function assertArtistCanJoinOrg(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  orgId: string,
): Promise<string | null> {
  const { data: blockingOrgId, error: blockErr } = await adminClient.rpc("studio_staff_blocking_org", {
    _user_id: userId,
    _target_org_id: orgId,
  });
  if (blockErr) throw blockErr;
  if (blockingOrgId) {
    return ARTIST_ALREADY_IN_STUDIO_MSG;
  }

  const { data: otherMembership, error: memberErr } = await adminClient
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .neq("organization_id", orgId)
    .limit(1)
    .maybeSingle();
  if (memberErr) throw memberErr;
  if (otherMembership?.organization_id) {
    return ARTIST_ALREADY_IN_STUDIO_MSG;
  }

  return null;
}

async function grantRoleDefaults(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  roleTemplate: "customer" | "artist",
): Promise<void> {
  const { data: defaults } = await adminClient
    .from("permission_role_defaults")
    .select("feature, granted")
    .eq("role_template", roleTemplate);

  for (const row of defaults ?? []) {
    await adminClient.from("user_permissions").upsert(
      { user_id: userId, feature: row.feature, granted: row.granted },
      { onConflict: "user_id,feature" },
    );
  }
}

async function provisionInvitedUser(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  inviteType: "customer" | "artist",
  orgId: string | null,
): Promise<void> {
  const { error: roleErr } = await adminClient.from("user_roles").upsert(
    { user_id: userId, role: inviteType },
    { onConflict: "user_id,role" },
  );
  if (roleErr?.message?.includes("artist_seat_limit_reached")) {
    throw new Error("artist_seat_limit_reached");
  }
  if (roleErr) throw roleErr;

  if (orgId) {
    await adminClient.from("organization_members").upsert(
      { organization_id: orgId, user_id: userId, role: "member" },
      { onConflict: "organization_id,user_id" },
    );
  }

  await grantRoleDefaults(adminClient, userId, inviteType);

  if (inviteType === "customer") {
    await adminClient.rpc("link_customer_records_by_email", { _user_id: userId });
  }
}

async function sendInviteLink(params: {
  adminClient: ReturnType<typeof createClient>;
  email: string;
  inviteType: "customer" | "artist";
  redirectTo: string;
  inviteDataPayload: Record<string, string>;
  preferMagicLink?: boolean;
}): Promise<{ user: { id: string } | null; error: string | null; existingAccount: boolean }> {
  const { adminClient, email, inviteType, redirectTo, inviteDataPayload, preferMagicLink = false } = params;
  const linkType = preferMagicLink ? "magiclink" : "invite";

  const { data: linkData, error: linkErr } = await (adminClient.auth.admin as any).generateLink({
    type: linkType,
    email,
    options: {
      redirectTo,
      data: inviteDataPayload,
    },
  });

  if (!linkErr && linkData?.properties?.action_link && linkData?.user?.id) {
    try {
      await sendInviteEmail({
        to: email,
        subject:
          inviteType === "customer"
            ? preferMagicLink
              ? `Your ${getShopBranding().shopName} customer portal is ready`
              : `Your ${getShopBranding().shopName} invite — magic link to set up your profile`
            : preferMagicLink
              ? `You now have artist access at ${getShopBranding().shopName}`
              : `You are invited to ${getShopBranding().shopName} (Magic Link)`,
        html:
          inviteType === "customer"
            ? preferMagicLink
              ? buildInviteEmailHtml({
                  roleLabel: "Customer Portal",
                  heading: `Your ${getShopBranding().shopName} portal is ready`,
                  intro:
                    "Your account already exists. We linked you to this studio — use the button below to sign in and view bookings.",
                  steps: [
                    "Open the secure sign-in link below (or continue with Google if you use that).",
                    "Confirm your profile details if prompted.",
                    "View bookings, deposits, and messages in one place.",
                  ],
                  buttonLabel: "Open Customer Portal",
                  magicLink: linkData.properties.action_link,
                })
              : buildCustomerInviteHtml({ magicLink: linkData.properties.action_link })
            : preferMagicLink
              ? buildInviteEmailHtml({
                  roleLabel: "Artist Portal",
                  heading: `Artist access at ${getShopBranding().shopName}`,
                  intro:
                    "Your account already exists. We added artist access for this studio — sign in with the link below to continue.",
                  steps: [
                    "Open your secure sign-in link.",
                    "Complete your artist profile if prompted.",
                    "Manage schedule, bookings, and clients.",
                  ],
                  buttonLabel: "Open Artist Hub",
                  magicLink: linkData.properties.action_link,
                })
              : buildArtistInviteHtml({ magicLink: linkData.properties.action_link }),
      });
      return { user: linkData.user, error: null, existingAccount: preferMagicLink };
    } catch (_smtpErr) {
      if (!preferMagicLink) {
        const fallback = await adminClient.auth.admin.inviteUserByEmail(email, {
          redirectTo,
          data: inviteDataPayload,
        });
        if (fallback.error && isExistingUserError(fallback.error.message || "")) {
          return sendInviteLink({ ...params, preferMagicLink: true });
        }
        return {
          user: fallback.data?.user ?? null,
          error: fallback.error?.message ?? null,
          existingAccount: false,
        };
      }
      return { user: linkData.user, error: "Email delivery failed", existingAccount: true };
    }
  }

  if (!preferMagicLink && isExistingUserError(linkErr?.message || "")) {
    return sendInviteLink({ ...params, preferMagicLink: true });
  }

  if (!preferMagicLink) {
    const fallback = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: inviteDataPayload,
    });
    if (fallback.error && isExistingUserError(fallback.error.message || "")) {
      return sendInviteLink({ ...params, preferMagicLink: true });
    }
    return {
      user: fallback.data?.user ?? null,
      error: fallback.error?.message ?? null,
      existingAccount: false,
    };
  }

  return {
    user: linkData?.user ?? null,
    error: linkErr?.message || "Invite failed",
    existingAccount: preferMagicLink,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    const authResult = await requireAuthenticatedUser(adminClient, req);
    if ("status" in authResult) {
      return jsonResponse(authResult.body, authResult.status);
    }

    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const inviteType = body.inviteType === "artist" ? "artist" : body.inviteType === "customer" ? "customer" : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: "Valid email required" }, 400);
    }
    if (!inviteType) {
      return jsonResponse({ error: "inviteType must be customer or artist" }, 400);
    }

    if (inviteType === "artist") {
      const isAdmin = await callerIsAdmin(adminClient, authResult.user.id);
      if (!isAdmin) {
        return jsonResponse({ error: "Forbidden", reason: "admin_required_for_artist_invite" }, 403);
      }

      let orgId: string | null = null;
      const { data: resolvedOrgId } = await adminClient.rpc("get_user_organization_id", {
        _user_id: authResult.user.id,
      });
      orgId = resolvedOrgId ?? null;
      if (!orgId) {
        const { data: soleOrg } = await adminClient.from("organizations").select("id").limit(1).maybeSingle();
        orgId = soleOrg?.id ?? null;
      }

      if (orgId) {
        const { data: canAdd } = await adminClient.rpc("org_can_add_artist_seat", { _org_id: orgId });
        if (canAdd === false) {
          const { data: usage } = await adminClient.rpc("get_org_seat_usage", { _user_id: authResult.user.id });
          const used = (usage as { used?: number })?.used ?? "?";
          const max = (usage as { max?: number })?.max ?? "?";
          return jsonResponse(
            {
              error: `Artist seat limit reached (${used}/${max}). Upgrade your plan to invite more artists.`,
              code: "seat_limit_reached",
            },
            403,
          );
        }
      }
    } else {
      const canInviteCustomer = await callerHasStaffAccess(adminClient, authResult.user.id);
      if (!canInviteCustomer) {
        return jsonResponse({ error: "Forbidden", reason: "staff_required_for_customer_invite" }, 403);
      }
    }

    let redirectTo =
      typeof body.redirectTo === "string" && /^https:\/\/.+\/auth/.test(body.redirectTo)
        ? body.redirectTo
        : typeof body.redirectTo === "string" && /^http:\/\/localhost(:\d+)?\/auth/.test(body.redirectTo)
          ? body.redirectTo
          : null;
    if (!redirectTo) {
      redirectTo = Deno.env.get("INVITE_REDIRECT_URL") || null;
    }
    if (!redirectTo) {
      const origin = req.headers.get("origin");
      const baseAuth = origin ? `${origin.replace(/\/$/, "")}/auth` : "http://localhost:5173/auth";
      redirectTo =
        inviteType === "customer"
          ? `${baseAuth}?${new URLSearchParams({ next: "/customer-profile-setup" })}`
          : baseAuth;
    }

    const inviteDataPayload = { invite_type: inviteType, ...(displayName ? { display_name: displayName } : {}) };

    const orgId = await resolveInviterOrgId(adminClient, authResult.user.id);

    if (inviteType === "artist" && orgId) {
      const existingUserId = await findUserIdByEmail(adminClient, email);
      if (existingUserId) {
        const blockMessage = await assertArtistCanJoinOrg(adminClient, existingUserId, orgId);
        if (blockMessage) {
          return jsonResponse({ error: blockMessage, code: "artist_already_in_studio" }, 409);
        }
      }
    }

    const inviteResult = await sendInviteLink({
      adminClient,
      email,
      inviteType,
      redirectTo,
      inviteDataPayload,
    });

    if (inviteResult.error || !inviteResult.user?.id) {
      return jsonResponse(
        { error: withCustomerMigrationHint(inviteResult.error || "Invite failed", inviteType) },
        400,
      );
    }

    const invitedUserId = inviteResult.user.id;

    if (inviteResult.existingAccount) {
      await adminClient.auth.admin.updateUserById(invitedUserId, {
        user_metadata: {
          ...inviteDataPayload,
        },
      });
    }

    try {
      await provisionInvitedUser(adminClient, invitedUserId, inviteType, orgId);
    } catch (provisionErr) {
      const msg = provisionErr instanceof Error ? provisionErr.message : "Provisioning failed";
      if (msg.includes("artist_seat_limit_reached")) {
        return jsonResponse(
          { error: "Artist seat limit reached for your plan. Upgrade to add more artists.", code: "seat_limit_reached" },
          403,
        );
      }
      if (msg.includes("studio_staff_single_org_only")) {
        return jsonResponse({ error: ARTIST_ALREADY_IN_STUDIO_MSG, code: "artist_already_in_studio" }, 409);
      }
      return jsonResponse({ error: withCustomerMigrationHint(msg, inviteType) }, 400);
    }

    return jsonResponse({
      ok: true,
      userId: invitedUserId,
      existingAccount: inviteResult.existingAccount,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

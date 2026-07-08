/**
 * Create Google Play review test accounts (admin org owner, artist, customer).
 *
 * Usage (PowerShell):
 *   $keys = npx supabase projects api-keys --project-ref tkremoxfkgoiuwghtzwd -o json | ConvertFrom-Json
 *   $env:SUPABASE_SERVICE_ROLE_KEY = ($keys.keys | Where-Object { $_.name -eq 'service_role' }).api_key
 *   node supabase/scripts/create-play-review-users.mjs
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://tkremoxfkgoiuwghtzwd.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PASSWORD = process.env.PLAY_REVIEW_PASSWORD || "VelbokPlayReview2026!";
const ORG_SLUG = "velbok-play-review";
const ORG_NAME = "Velbok Play Review Studio";

const USERS = [
  {
    key: "admin",
    email: "mr.steve.dnu+play-admin@gmail.com",
    displayName: "Play Review Admin",
    inviteType: null,
    roles: ["admin", "artist"],
    grantAllStaff: true,
  },
  {
    key: "artist",
    email: "mr.steve.dnu+play-artist@gmail.com",
    displayName: "Play Review Artist",
    inviteType: "artist",
    roles: ["artist"],
    grantAllStaff: false,
  },
  {
    key: "customer",
    email: "mr.steve.dnu+play-customer@gmail.com",
    displayName: "Play Review Customer",
    inviteType: "customer",
    roles: ["customer"],
    grantAllStaff: false,
  },
];

const STAFF_FEATURES = [
  "schedule", "inbox", "services", "stencil", "clients", "stock",
  "dashboard", "settings", "deposits", "billing", "checkout", "admin",
];
const CUSTOMER_FEATURES = ["my_bookings", "customer_consent"];

if (!SERVICE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureAuthUser({ email, displayName, inviteType }) {
  const meta = {
    display_name: displayName,
    play_review: true,
    ...(inviteType ? { invite_type: inviteType } : {}),
  };

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: meta,
  });

  if (!createErr && created.user) {
    return created.user;
  }

  const msg = createErr?.message || "";
  if (!/already|registered|exists/i.test(msg)) {
    throw createErr || new Error(`Failed to create ${email}`);
  }

  const { data: listed, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw listErr;
  const existing = listed.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!existing) throw new Error(`User exists but not found in list: ${email}`);

  const { data: updated, error: updateErr } = await admin.auth.admin.updateUserById(existing.id, {
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { ...existing.user_metadata, ...meta },
  });
  if (updateErr) throw updateErr;
  return updated.user;
}

async function applyRoleDefaults(userId, roleTemplate) {
  const { data: defaults, error } = await admin
    .from("permission_role_defaults")
    .select("feature, granted")
    .eq("role_template", roleTemplate);
  if (error) throw error;
  for (const row of defaults ?? []) {
    const { error: upsertErr } = await admin.from("user_permissions").upsert(
      { user_id: userId, feature: row.feature, granted: row.granted },
      { onConflict: "user_id,feature" },
    );
    if (upsertErr) throw upsertErr;
  }
}

async function grantFeatures(userId, features) {
  for (const feature of features) {
    const { error } = await admin.from("user_permissions").upsert(
      { user_id: userId, feature, granted: true },
      { onConflict: "user_id,feature" },
    );
    if (error) throw error;
  }
}

async function ensureProfile(userId, displayName) {
  const { error } = await admin.from("profiles").upsert(
    { user_id: userId, display_name: displayName },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

async function ensureRoles(userId, roles) {
  for (const role of roles) {
    const { error } = await admin.from("user_roles").upsert(
      { user_id: userId, role },
      { onConflict: "user_id,role" },
    );
    if (error) throw error;
  }
}

async function removeFromOtherOrgs(userId, keepOrgId) {
  const { data: memberships, error } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId);
  if (error) throw error;

  for (const row of memberships ?? []) {
    if (row.organization_id === keepOrgId) continue;
    const { error: deleteErr } = await admin
      .from("organization_members")
      .delete()
      .eq("user_id", userId)
      .eq("organization_id", row.organization_id);
    if (deleteErr) throw deleteErr;
  }
}

async function ensureOrg(adminUserId) {
  const { data: existing } = await admin.from("organizations").select("id").eq("slug", ORG_SLUG).maybeSingle();
  let orgId = existing?.id ?? null;

  if (!orgId) {
    const { data: inserted, error } = await admin
      .from("organizations")
      .insert({
        name: ORG_NAME,
        slug: ORG_SLUG,
        owner_user_id: adminUserId,
        status: "active",
        is_sandbox: true,
      })
      .select("id")
      .single();
    if (error) throw error;
    orgId = inserted.id;
  } else {
    await admin.from("organizations").update({ owner_user_id: adminUserId, status: "active", is_sandbox: true }).eq("id", orgId);
  }

  await admin.from("organization_members").upsert(
    { organization_id: orgId, user_id: adminUserId, role: "owner" },
    { onConflict: "organization_id,user_id" },
  );

  const { data: shop } = await admin.from("shop_settings").select("id").eq("organization_id", orgId).maybeSingle();
  if (!shop) {
    const { error: shopErr } = await admin.from("shop_settings").insert({
      organization_id: orgId,
      shop_name: ORG_NAME,
      legal_name: "Velbok Play Review Ltd",
      trading_name: ORG_NAME,
      setup_completed_at: new Date().toISOString(),
    });
    if (shopErr) throw shopErr;
  } else {
    await admin
      .from("shop_settings")
      .update({ setup_completed_at: new Date().toISOString() })
      .eq("organization_id", orgId);
  }

  await admin.from("platform_subscriptions").upsert(
    {
      organization_id: orgId,
      plan_id: "enterprise",
      status: "active",
      trial_end: null,
      current_period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    },
    { onConflict: "organization_id" },
  );

  return orgId;
}

async function linkMember(orgId, userId, memberRole = "member") {
  await admin.from("organization_members").upsert(
    { organization_id: orgId, user_id: userId, role: memberRole },
    { onConflict: "organization_id,user_id" },
  );
}

async function main() {
  const results = [];

  const adminSpec = USERS.find((u) => u.key === "admin");
  const adminUser = await ensureAuthUser(adminSpec);
  await ensureProfile(adminUser.id, adminSpec.displayName);
  const orgId = await ensureOrg(adminUser.id);
  await ensureRoles(adminUser.id, adminSpec.roles);
  await grantFeatures(adminUser.id, [...STAFF_FEATURES, ...CUSTOMER_FEATURES]);
  await removeFromOtherOrgs(adminUser.id, orgId);
  results.push({ role: "admin", email: adminSpec.email, userId: adminUser.id });

  for (const spec of USERS.filter((u) => u.key !== "admin")) {
    const user = await ensureAuthUser(spec);
    await ensureProfile(user.id, spec.displayName);
    await linkMember(orgId, user.id);
    await removeFromOtherOrgs(user.id, orgId);
    await ensureRoles(user.id, spec.roles);
    if (spec.grantAllStaff) {
      await grantFeatures(user.id, [...STAFF_FEATURES, ...CUSTOMER_FEATURES]);
    } else if (spec.key === "artist") {
      await applyRoleDefaults(user.id, "artist");
    } else if (spec.key === "customer") {
      await applyRoleDefaults(user.id, "customer");
    }
    results.push({ role: spec.key, email: spec.email, userId: user.id });
  }

  const credPath = path.join(root, "docs/play-review-credentials.txt");
  const lines = [
    "# Velbok Google Play review accounts — DO NOT COMMIT (gitignored)",
    `# Organization: ${ORG_NAME} (${ORG_SLUG})`,
    `# Created: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "Use these in Play Console → App content → App access.",
    "Sign in with email + password (not Google Sign-In). MFA is not enabled on these accounts.",
    "",
    `Shared password: ${PASSWORD}`,
    "",
    "--- ORG ADMIN (full studio access) ---",
    `Email: ${adminSpec.email}`,
    `Password: ${PASSWORD}`,
    "",
    "--- ARTIST (same organization) ---",
    `Email: ${USERS.find((u) => u.key === "artist").email}`,
    `Password: ${PASSWORD}`,
    "",
    "--- CUSTOMER (portal: /account) ---",
    `Email: ${USERS.find((u) => u.key === "customer").email}`,
    `Password: ${PASSWORD}`,
    "",
    "--- Play Console instructions (paste) ---",
    "Velbok requires login.",
    "",
    "Staff/admin test:",
    `1. Open app → Sign in → ${adminSpec.email} / password above.`,
    "2. Schedule, Admin, Settings, and Billing are available.",
    "",
    "Artist test:",
    `1. Sign out → Sign in → ${USERS.find((u) => u.key === "artist").email} / same password.`,
    "2. Artist sees schedule and staff features per artist permissions.",
    "",
    "Customer test:",
    `1. Sign out → Sign in → ${USERS.find((u) => u.key === "customer").email} / same password.`,
    "2. Customer portal opens at /account (bookings, tickets, consent).",
    "",
    "Tap to Pay / card payments require Stripe Terminal setup and supported hardware — not required for review.",
    "",
    "User IDs:",
    ...results.map((r) => `${r.role}: ${r.userId}`),
    "",
  ];

  fs.mkdirSync(path.dirname(credPath), { recursive: true });
  fs.writeFileSync(credPath, lines.join("\n"), "utf8");

  console.log("[create-play-review-users] Done.");
  console.log(`Organization: ${ORG_NAME} (${orgId})`);
  for (const r of results) {
    console.log(`  ${r.role}: ${r.email}`);
  }
  console.log(`Credentials written to ${path.relative(root, credPath)}`);
  console.log(`Password: ${PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

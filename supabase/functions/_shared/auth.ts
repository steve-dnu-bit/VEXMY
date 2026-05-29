import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const jsonCorsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function parseBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m ? m[1].trim() : null;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...jsonCorsHeaders, "Content-Type": "application/json" },
  });
}

export async function requireAuthenticatedUser(
  admin: SupabaseClient,
  req: Request,
): Promise<{ user: User } | { status: number; body: Record<string, unknown> }> {
  const token = parseBearerToken(req);
  if (!token) {
    return { status: 401, body: { error: "Unauthorized", reason: "missing_bearer_token" } };
  }
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return { status: 401, body: { error: "Unauthorized", reason: "invalid_or_expired_token" } };
  }
  return { user: data.user };
}

/** Staff: admin/artist role or schedule/deposits/billing permission. */
export async function callerHasStaffAccess(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data: staffRows } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "artist"]);
  if ((staffRows || []).length > 0) return true;

  for (const feature of ["schedule", "deposits", "billing"] as const) {
    const { data } = await admin.rpc("has_permission", { _user_id: userId, _feature: feature });
    if (data) return true;
  }
  return false;
}

export async function callerIsAdmin(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
  return !!data;
}

/** Cron jobs: Authorization Bearer CRON_SECRET or x-cron-secret header. */
export function isCronAuthorized(req: Request): boolean {
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected) return false;
  const headerSecret = req.headers.get("x-cron-secret");
  if (headerSecret && headerSecret === expected) return true;
  const bearer = parseBearerToken(req);
  return bearer === expected;
}

export function requireCronAuth(req: Request): Response | null {
  if (isCronAuthorized(req)) return null;
  if (!Deno.env.get("CRON_SECRET")) {
    return jsonResponse({ error: "Server misconfigured", reason: "cron_secret_not_set" }, 500);
  }
  return jsonResponse({ error: "Unauthorized", reason: "invalid_cron_secret" }, 401);
}

/** Customer consent: owns booking via linked account or email match. */
export function customerOwnsBooking(
  booking: { client_user_id?: string | null; client_email?: string | null },
  user: User,
): boolean {
  if (booking.client_user_id && booking.client_user_id === user.id) return true;
  const bookingEmail = (booking.client_email || "").trim().toLowerCase();
  const userEmail = (user.email || "").trim().toLowerCase();
  return !!bookingEmail && !!userEmail && bookingEmail === userEmail;
}

export async function callerIsOnlyCustomer(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data: rows } = await admin.from("user_roles").select("role").eq("user_id", userId);
  const roles = (rows || []).map((r) => r.role as string);
  const hasStaff = roles.some((r) => r === "admin" || r === "artist");
  return roles.includes("customer") && !hasStaff;
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  jsonCorsHeaders,
  jsonResponse,
  requireAuthenticatedUser,
} from "../_shared/auth.ts";
import {
  factorIdsMatch,
  hashDeviceToken,
  trustedDeviceExpiresAt,
} from "../_shared/trusted-device.ts";

const corsHeaders = jsonCorsHeaders;

type Action = "check" | "register" | "revoke_all";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const authResult = await requireAuthenticatedUser(admin, req);
  if ("status" in authResult) {
    return jsonResponse(authResult.body, authResult.status);
  }
  const user = authResult.user;

  let body: { action?: Action; device_id?: string; factor_ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const action = body.action;
  if (!action || !["check", "register", "revoke_all"].includes(action)) {
    return jsonResponse({ error: "Invalid action" }, 400);
  }

  if (action === "revoke_all") {
    const { error } = await admin
      .from("trusted_devices")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("revoked_at", null);
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ revoked: true });
  }

  const deviceId = (body.device_id ?? "").trim();
  if (!deviceId) return jsonResponse({ error: "device_id required" }, 400);

  let tokenHash: string;
  try {
    tokenHash = await hashDeviceToken(user.id, deviceId);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }

  if (action === "register") {
    const factorIds = (body.factor_ids ?? []).filter((id) => typeof id === "string" && id.trim());
    if (factorIds.length === 0) {
      return jsonResponse({ error: "factor_ids required" }, 400);
    }

    const expiresAt = trustedDeviceExpiresAt();
    const userAgent = req.headers.get("user-agent");

    const { error } = await admin.from("trusted_devices").upsert(
      {
        user_id: user.id,
        device_token_hash: tokenHash,
        factor_ids: factorIds,
        user_agent: userAgent,
        last_seen_at: new Date().toISOString(),
        expires_at: expiresAt,
        revoked_at: null,
      },
      { onConflict: "user_id,device_token_hash" },
    );
    if (error) return jsonResponse({ error: error.message }, 500);

    return jsonResponse({ registered: true, expires_at: expiresAt });
  }

  const currentFactorIds = (body.factor_ids ?? []).filter((id) => typeof id === "string" && id.trim());
  const now = new Date().toISOString();

  const { data: row, error } = await admin
    .from("trusted_devices")
    .select("id, factor_ids, expires_at")
    .eq("user_id", user.id)
    .eq("device_token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .maybeSingle();

  if (error) return jsonResponse({ error: error.message }, 500);
  if (!row) return jsonResponse({ trusted: false });

  const trusted = factorIdsMatch(row.factor_ids as string[], currentFactorIds);
  if (trusted) {
    await admin
      .from("trusted_devices")
      .update({ last_seen_at: now })
      .eq("id", row.id);
  }

  return jsonResponse({ trusted, expires_at: row.expires_at });
});

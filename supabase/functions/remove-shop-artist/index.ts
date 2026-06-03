import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { callerIsAdmin, jsonCorsHeaders, jsonResponse, requireAuthenticatedUser } from "../_shared/auth.ts";

const corsHeaders = jsonCorsHeaders;

const STAFF_FEATURES = [
  "schedule",
  "inbox",
  "services",
  "stencil",
  "clients",
  "stock",
  "dashboard",
  "settings",
  "deposits",
  "billing",
  "admin",
] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
    const authResult = await requireAuthenticatedUser(adminClient, req);
    if ("status" in authResult) {
      return jsonResponse(authResult.body, authResult.status);
    }

    const isAdmin = await callerIsAdmin(adminClient, authResult.user.id);
    if (!isAdmin) {
      return jsonResponse({ error: "Forbidden", reason: "admin_required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!targetUserId) {
      return jsonResponse({ error: "userId is required" }, 400);
    }

    if (targetUserId === authResult.user.id) {
      return jsonResponse({ error: "You cannot remove yourself from the shop" }, 400);
    }

    const { data: roleRows, error: rolesErr } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", targetUserId);
    if (rolesErr) {
      return jsonResponse({ error: rolesErr.message }, 500);
    }

    const roles = (roleRows || []).map((r) => r.role as string);
    if (!roles.includes("artist")) {
      return jsonResponse({ error: "This user is not an artist on your shop" }, 400);
    }

    const { error: deleteArtistRoleErr } = await adminClient
      .from("user_roles")
      .delete()
      .eq("user_id", targetUserId)
      .eq("role", "artist");
    if (deleteArtistRoleErr) {
      return jsonResponse({ error: deleteArtistRoleErr.message }, 500);
    }

    if (roles.includes("assistant")) {
      await adminClient.from("user_roles").delete().eq("user_id", targetUserId).eq("role", "assistant");
    }

    await adminClient.from("organization_members").delete().eq("user_id", targetUserId);

    for (const feature of STAFF_FEATURES) {
      await adminClient.from("user_permissions").delete().eq("user_id", targetUserId).eq("feature", feature);
    }

    const stillAdmin = roles.includes("admin");
    const { data: profile } = await adminClient
      .from("profiles")
      .select("display_name")
      .eq("user_id", targetUserId)
      .maybeSingle();

    return jsonResponse({
      ok: true,
      userId: targetUserId,
      displayName: profile?.display_name ?? null,
      keptAdminAccess: stillAdmin,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});

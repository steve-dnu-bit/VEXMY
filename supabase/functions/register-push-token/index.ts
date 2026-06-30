import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { jsonCorsHeaders, jsonResponse, requireAuthenticatedUser } from "../_shared/auth.ts";

const corsHeaders = jsonCorsHeaders;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) return jsonResponse({ error: "Server misconfigured" }, 500);

    const admin = createClient(supabaseUrl, serviceKey);
    const auth = await requireAuthenticatedUser(admin, req);
    if ("status" in auth) return jsonResponse(auth.body, auth.status);

    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const platform = body.platform === "ios" ? "ios" : body.platform === "android" ? "android" : null;
    const deviceLabel = typeof body.device_label === "string" ? body.device_label.trim().slice(0, 120) : null;

    if (!token || token.length < 20) return jsonResponse({ error: "Invalid token" }, 400);
    if (!platform) return jsonResponse({ error: "platform must be android or ios" }, 400);

    const now = new Date().toISOString();
    const { error } = await admin.from("device_push_tokens").upsert(
      {
        user_id: auth.user.id,
        platform,
        token,
        device_label: deviceLabel,
        is_active: true,
        last_seen_at: now,
        updated_at: now,
      },
      { onConflict: "user_id,token" },
    );

    if (error) return jsonResponse({ error: error.message }, 500);

    if (body.deactivate_other_tokens === true) {
      await admin
        .from("device_push_tokens")
        .update({ is_active: false, updated_at: now })
        .eq("user_id", auth.user.id)
        .neq("token", token);
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});

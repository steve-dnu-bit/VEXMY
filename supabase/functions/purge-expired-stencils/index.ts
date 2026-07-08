// Scheduled cleanup: delete generated stencils (storage objects + database
// rows) once their 24-hour retention window has elapsed.
//
// Invoked by pg_cron with the shared CRON_SECRET (see the
// stencil_retention_cron migration). Runs with the service role so it can
// remove objects from the `uploads` bucket regardless of owner.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { jsonCorsHeaders, jsonResponse, requireCronAuth } from "../_shared/auth.ts";

const corsHeaders = jsonCorsHeaders;

const UPLOADS_BUCKET = "uploads";

type StencilRow = {
  id: string;
  original_image_url: string | null;
  stencil_image_url: string | null;
};

/**
 * Derive the storage object path from a Supabase public URL or uploads: ref.
 */
function storagePathFromStored(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("uploads:")) return url.slice("uploads:".length);
  const marker = `/object/public/${UPLOADS_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx !== -1) {
    const path = url.slice(idx + marker.length).split("?")[0];
    return path ? decodeURIComponent(path) : null;
  }
  const signedMarker = `/object/sign/${UPLOADS_BUCKET}/`;
  const sidx = url.indexOf(signedMarker);
  if (sidx !== -1) {
    const path = url.slice(sidx + signedMarker.length).split("?")[0];
    return path ? decodeURIComponent(path) : null;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronError = requireCronAuth(req);
  if (cronError) return cronError;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }
  const admin = createClient(supabaseUrl, serviceKey);

  const nowIso = new Date().toISOString();
  const { data: expired, error } = await admin
    .from("stencils")
    .select("id, original_image_url, stencil_image_url")
    .lt("expires_at", nowIso)
    .limit(500);

  if (error) {
    console.error("purge-expired-stencils: query failed", error.message);
    return jsonResponse({ error: "Query failed" }, 500);
  }

  const rows = (expired ?? []) as StencilRow[];
  if (rows.length === 0) {
    return jsonResponse({ purged: 0 });
  }

  const paths = new Set<string>();
  for (const row of rows) {
    const a = storagePathFromStored(row.original_image_url);
    const b = storagePathFromStored(row.stencil_image_url);
    if (a) paths.add(a);
    if (b) paths.add(b);
  }

  if (paths.size > 0) {
    const { error: storageError } = await admin.storage
      .from(UPLOADS_BUCKET)
      .remove([...paths]);
    if (storageError) {
      // Log but continue — removing the DB rows is the source of truth and
      // orphaned objects can be cleaned on a later run.
      console.error("purge-expired-stencils: storage remove failed", storageError.message);
    }
  }

  const ids = rows.map((r) => r.id);
  const { error: deleteError } = await admin.from("stencils").delete().in("id", ids);
  if (deleteError) {
    console.error("purge-expired-stencils: row delete failed", deleteError.message);
    return jsonResponse({ error: "Delete failed" }, 500);
  }

  return jsonResponse({ purged: ids.length });
});

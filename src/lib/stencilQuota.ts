import { supabase } from "@/integrations/supabase/client";

export type StencilQuota = {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string | null;
};

/**
 * Read the studio's daily AI-stencil allowance (one generation per occupied
 * artist seat per day). Returns null if the quota can't be determined.
 */
export async function fetchStencilQuota(): Promise<StencilQuota | null> {
  const { data, error } = await supabase.rpc("stencil_quota_status");
  if (error || !data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  return {
    used: Number(d.used ?? 0),
    limit: Number(d.limit ?? 0),
    remaining: Number(d.remaining ?? 0),
    resetsAt: typeof d.resets_at === "string" ? d.resets_at : null,
  };
}

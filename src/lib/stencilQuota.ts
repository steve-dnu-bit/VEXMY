import { supabase } from "@/integrations/supabase/client";

export type StencilQuota = {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string | null;
};

/**
 * Read the signed-in user's AI stencil allowance for a rolling 24-hour window.
 * Limit depends on the studio plan (Starter 3, Studio 6, Enterprise 10).
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

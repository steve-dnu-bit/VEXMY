import { supabase } from "@/integrations/supabase/client";
import { getUserOrganizationId } from "@/lib/shopSettings";

export interface OrgService {
  id: string;
  organization_id: string;
  name: string;
  duration: number;
  booking_type: string;
  service_category: string;
  color: string;
  price: number | null;
  deposit_required: boolean;
  deposit_amount: number | null;
  is_active: boolean;
  sort_order: number;
  created_by: string;
}

export async function ensureDefaultOrgServices(orgId: string): Promise<void> {
  const { error } = await supabase.rpc("ensure_default_org_services", { _org_id: orgId });
  if (error) console.warn("ensure_default_org_services failed", error.message);
}

export async function loadOrgServices(opts?: { activeOnly?: boolean }): Promise<OrgService[]> {
  const orgId = await getUserOrganizationId();
  if (!orgId) return [];

  await ensureDefaultOrgServices(orgId);

  let query = supabase.from("services").select("*").eq("organization_id", orgId).order("sort_order");
  if (opts?.activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("loadOrgServices failed", error.message);
    return [];
  }
  return (data ?? []) as OrgService[];
}

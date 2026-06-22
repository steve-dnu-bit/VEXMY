import { supabase } from "@/integrations/supabase/client";
import { getUserOrganizationId } from "@/lib/shopSettings";

export async function loadArtistDataPrivacy(orgId?: string | null): Promise<boolean> {
  const resolvedOrgId = orgId ?? (await getUserOrganizationId());
  if (!resolvedOrgId) return false;

  const { data, error } = await supabase
    .from("shop_settings" as any)
    .select("artist_data_privacy")
    .eq("organization_id", resolvedOrgId)
    .maybeSingle();

  if (error || !data) return false;
  return Boolean((data as { artist_data_privacy?: boolean }).artist_data_privacy);
}

export async function saveArtistDataPrivacy(
  enabled: boolean,
  shopId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("shop_settings" as any)
    .update({ artist_data_privacy: enabled, updated_at: new Date().toISOString() })
    .eq("id", shopId);

  return { error: error?.message ?? null };
}

export async function currentUserBypassesArtistDataPrivacy(orgId?: string | null): Promise<boolean> {
  const resolvedOrgId = orgId ?? (await getUserOrganizationId());
  if (!resolvedOrgId) return true;

  const { data, error } = await supabase.rpc("staff_bypasses_artist_data_privacy" as any, {
    _uid: (await supabase.auth.getUser()).data.user?.id,
    _org_id: resolvedOrgId,
  });

  if (error) return false;
  return Boolean(data);
}

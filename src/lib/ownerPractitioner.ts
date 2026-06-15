import { supabase } from "@/integrations/supabase/client";
import { saveShopSettings } from "@/lib/shopSettings";

export async function applyOwnerPractitionerChoice(
  userId: string,
  shopId: string,
  isPractitioner: boolean,
): Promise<{ error: string | null }> {
  const { error: settingsError } = await saveShopSettings(shopId, {
    owner_is_practitioner: isPractitioner,
  });
  if (settingsError) return { error: settingsError };

  if (isPractitioner) {
    const { error } = await supabase.from("user_roles").upsert(
      { user_id: userId, role: "artist" },
      { onConflict: "user_id,role" },
    );
    return { error: error?.message ?? null };
  }

  const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "artist");
  return { error: error?.message ?? null };
}

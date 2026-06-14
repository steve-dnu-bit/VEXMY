import { supabase } from "@/integrations/supabase/client";

/** Velbok platform operator (cross-tenant superuser), not the same as shop `admin` role. */
export async function fetchIsPlatformAdmin(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("platform_admin_is_me");
    if (!error) return !!data;

    const { data: fallback, error: fallbackError } = await supabase.rpc("is_platform_admin", {
      _user_id: userId,
    });
    if (fallbackError) return false;
    return !!fallback;
  } catch {
    return false;
  }
}

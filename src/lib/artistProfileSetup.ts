import { supabase } from "@/integrations/supabase/client";

export async function needsArtistProfileSetup(userId: string): Promise<boolean> {
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "artist")
    .limit(1);

  if (!roleRows?.length) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("public_profile_completed")
    .eq("user_id", userId)
    .maybeSingle();

  return profile ? !profile.public_profile_completed : true;
}

export function getSafeNextPath(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  const path = raw.split("?")[0];
  const allow = new Set([
    "/artist-profile-settings",
    "/customer-profile-setup",
    "/schedule",
    "/account",
    "/consent",
    "/deposit-payment",
    "/deposit-payment/checkout",
  ]);
  return allow.has(path) ? raw : null;
}


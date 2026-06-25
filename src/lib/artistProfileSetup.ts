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

const CUSTOMER_POST_LOGIN_PREFIXES = [
  "/account",
  "/consent",
  "/deposit-payment",
  "/customer-profile-setup",
] as const;

const STAFF_POST_LOGIN_PREFIXES = [
  "/schedule",
  "/inbox",
  "/admin",
  "/billing",
  "/dashboard",
  "/settings",
  "/deposits",
  "/services",
  "/stencil",
  "/stock",
  "/checkout",
  "/artist-profile-settings",
  "/shop-setup",
  "/clients",
] as const;

function pathMatchesPrefix(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Only honor ?next= when the signed-in user may access that destination. */
export async function canUsePostLoginNext(userId: string, next: string): Promise<boolean> {
  const path = next.split("?")[0];

  if (pathMatchesPrefix(path, CUSTOMER_POST_LOGIN_PREFIXES)) {
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "customer")
      .limit(1);
    if (roleRows?.length) return true;
    try {
      const { data } = await supabase.rpc("has_permission", {
        _user_id: userId,
        _feature: "my_bookings",
      });
      return !!data;
    } catch {
      return false;
    }
  }

  if (pathMatchesPrefix(path, STAFF_POST_LOGIN_PREFIXES)) {
    const { fetchHasStaffAccess } = await import("@/hooks/useUserRoles");
    return fetchHasStaffAccess(userId);
  }

  return true;
}


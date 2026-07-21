import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getSafeNextPath, needsArtistProfileSetup, canUsePostLoginNext } from "@/lib/artistProfileSetup";
import { needsCustomerProfileSetup } from "@/lib/customerProfileSetup";
import { hasActiveOrganizationSubscription, needsShopSetup } from "@/lib/shopSettings";
import { fetchIsPlatformAdmin } from "@/lib/platformAdmin";
import { isNativeApp } from "@/lib/platform";

export type AppRole = "admin" | "artist" | "customer";

export function useUserRoles() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRoles([]);
      setLoading(false);
      return;
    }
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data, error }) => {
        if (error) {
          setRoles([]);
          setLoading(false);
          return;
        }
        setRoles((data?.map((r) => r.role as AppRole) ?? []) as AppRole[]);
        setLoading(false);
      });
  }, [user?.id]);

  const hasStaffRole = roles.some((r) => r === "admin" || r === "artist");
  const isOnlyCustomer = roles.includes("customer") && !hasStaffRole;
  const hasNoAppRoles = !loading && roles.length === 0;

  return { roles, hasStaffRole, isOnlyCustomer, hasNoAppRoles, loading };
}

export async function fetchIsOnlyCustomer(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (error) return false;
    const list = data?.map((r) => r.role) ?? [];
    const staff = list.some((r) => r === "admin" || r === "artist");
    return list.includes("customer") && !staff;
  } catch {
    return false;
  }
}

export async function fetchHasStaffRole(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (error) return false;
    return (data ?? []).some((r) => r.role === "admin" || r.role === "artist");
  } catch {
    return false;
  }
}

/** Where to send a user immediately after sign-in (matches AuthHomeRedirect). */
export async function resolvePostLoginPath(userId: string, rawNext: string | null): Promise<string> {
  if (await needsShopSetup(userId)) return "/shop-setup";
  if (await needsArtistProfileSetup(userId)) return "/artist-profile-settings";
  if (await needsCustomerProfileSetup(userId)) return "/customer-profile-setup";
  const next = getSafeNextPath(rawNext);
  if (next && (await canUsePostLoginNext(userId, next))) return next;
  if (await fetchIsOnlyCustomer(userId)) return "/account";
  if (await fetchHasStaffAccess(userId)) {
    if (!(await hasActiveOrganizationSubscription(userId))) {
      // Mobile app has no /subscribe page — avoid auth ↔ subscribe redirect loop.
      return isNativeApp() ? "/billing" : "/subscribe?plan=studio";
    }
    return "/schedule";
  }
  if (await fetchHasNoAppRoles(userId)) {
    // Native: /billing is StaffRoute-guarded and rejects no-role users (redirect loop
    // → black screen). Land on /account, which renders for any signed-in user.
    return isNativeApp() ? "/account" : "/subscribe?plan=studio";
  }
  return "/account";
}

/** Signed-in user with no rows in user_roles (e.g. mistaken signup email). */
export async function fetchHasNoAppRoles(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (error) return false;
    return (data?.length ?? 0) === 0;
  } catch {
    return false;
  }
}

/** Matches edge-function staff checks: platform admin, admin/artist role, or staff permissions. */
export async function fetchHasStaffAccess(userId: string): Promise<boolean> {
  if (await fetchIsPlatformAdmin(userId)) return true;
  if (await fetchHasStaffRole(userId)) return true;
  try {
    for (const feature of ["schedule", "deposits", "billing", "checkout", "admin"] as const) {
      const { data } = await supabase.rpc("has_permission", { _user_id: userId, _feature: feature });
      if (data) return true;
    }
    return false;
  } catch {
    return false;
  }
}

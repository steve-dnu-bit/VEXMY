import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
  }, [user]);

  const hasStaffRole = roles.some((r) => r === "admin" || r === "artist");
  const isOnlyCustomer = roles.includes("customer") && !hasStaffRole;

  return { roles, hasStaffRole, isOnlyCustomer, loading };
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

/** Matches edge-function staff checks: admin/artist role or schedule/deposits/billing permission. */
export async function fetchHasStaffAccess(userId: string): Promise<boolean> {
  if (await fetchHasStaffRole(userId)) return true;
  try {
    for (const feature of ["schedule", "deposits", "billing"] as const) {
      const { data } = await supabase.rpc("has_permission", { _user_id: userId, _feature: feature });
      if (data) return true;
    }
    return false;
  } catch {
    return false;
  }
}

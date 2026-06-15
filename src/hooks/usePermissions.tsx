import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const FEATURES = [
  "schedule", "inbox", "services", "stencil", "clients",
  "stock", "dashboard", "settings", "deposits", "billing", "checkout", "admin",
  "my_bookings", "customer_consent",
] as const;

/** Staff app areas (permission matrix for artists) */
export const STAFF_FEATURES: Feature[] = [
  "schedule", "inbox", "services", "stencil", "clients",
  "stock", "dashboard", "settings", "deposits", "billing", "checkout", "admin",
];

/** Customer portal areas */
export const CUSTOMER_FEATURES: Feature[] = ["my_bookings", "customer_consent"];

export type Feature = (typeof FEATURES)[number];

export interface UserPermission {
  user_id: string;
  feature: string;
  granted: boolean;
}

export const usePermissions = () => {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<UserPermission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setPermissions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("user_permissions")
      .select("user_id, feature, granted")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (cancelled) return;
        if (data) setPermissions(data);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const hasPermission = (feature: Feature): boolean =>
    permissions.some((p) => p.feature === feature && p.granted);

  return { permissions, hasPermission, loading };
};

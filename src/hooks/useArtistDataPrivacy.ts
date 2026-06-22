import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserBypassesArtistDataPrivacy,
  loadArtistDataPrivacy,
} from "@/lib/shopArtistPrivacy";
import { getUserOrganizationId } from "@/lib/shopSettings";

async function userHasArtistRole(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "artist");
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

export function useArtistDataPrivacy() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [restricted, setRestricted] = useState(false);
  const [bypasses, setBypasses] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!user) {
        setEnabled(false);
        setRestricted(false);
        setBypasses(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      const orgId = await getUserOrganizationId(user.id);
      const [privacyOn, bypass, isArtist] = await Promise.all([
        loadArtistDataPrivacy(orgId),
        currentUserBypassesArtistDataPrivacy(orgId),
        userHasArtistRole(user.id),
      ]);
      if (cancelled) return;
      setEnabled(privacyOn);
      setBypasses(bypass);
      setRestricted(privacyOn && isArtist && !bypass);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return { enabled, restricted, bypasses, loading };
}

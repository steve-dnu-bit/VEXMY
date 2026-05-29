import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { fetchIsOnlyCustomer } from "@/hooks/useUserRoles";
import { getSafeNextPath, needsArtistProfileSetup } from "@/lib/artistProfileSetup";
import { needsCustomerProfileSetup } from "@/lib/customerProfileSetup";

/** After login: customers → /account, staff → /schedule */
const AuthHomeRedirect = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const next = getSafeNextPath(searchParams.get("next"));
    (async () => {
      try {
        if (await needsArtistProfileSetup(user.id)) {
          setPath("/artist-profile-settings");
          return;
        }
        if (await needsCustomerProfileSetup(user.id)) {
          setPath("/customer-profile-setup");
          return;
        }
        if (next) {
          setPath(next);
          return;
        }
        const only = await fetchIsOnlyCustomer(user.id);
        setPath(only ? "/account" : "/schedule");
      } catch {
        setPath("/schedule");
      }
    })();
  }, [searchParams, user]);

  if (!path) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }
  return <Navigate to={path} replace />;
};

export default AuthHomeRedirect;

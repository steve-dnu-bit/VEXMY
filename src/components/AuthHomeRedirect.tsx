import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { resolvePostLoginPath } from "@/hooks/useUserRoles";

/** After login: customers → /account, staff → /schedule */
const AuthHomeRedirect = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        setPath(await resolvePostLoginPath(user.id, searchParams.get("next")));
      } catch {
        setPath("/account");
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

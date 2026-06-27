import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { resolvePostLoginPath } from "@/hooks/useUserRoles";
import { completeAuthProvisioningFromContext } from "@/lib/authProvisioning";

/** After login: customers → /account, staff → /schedule */
const AuthHomeRedirect = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (!cancelled) setPath((current) => current ?? "/schedule");
    }, 12_000);

    (async () => {
      try {
        await completeAuthProvisioningFromContext(searchParams);
        if (!cancelled) {
          setPath(await resolvePostLoginPath(user.id, searchParams.get("next")));
        }
      } catch {
        if (!cancelled) setPath("/account");
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [searchParams, user]);

  if (!path) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      </div>
    );
  }
  return <Navigate to={path} replace />;
};

export default AuthHomeRedirect;

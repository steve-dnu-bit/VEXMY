import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePlatformAdminAccess } from "@/hooks/usePlatformAdmin";

const PlatformAdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation();
  const { data: isPlatformAdmin, isLoading } = usePlatformAdminAccess();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="sr-only">{t("common.loading")}</span>
      </div>
    );
  }

  if (!isPlatformAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
};

export default PlatformAdminRoute;

import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { fetchHasStaffAccess, fetchIsOnlyCustomer } from "@/hooks/useUserRoles";
import { needsCustomerProfileSetup } from "@/lib/customerProfileSetup";
import { needsShopSetup } from "@/lib/shopSettings";
import { useTranslation } from "react-i18next";

/** Customers without a staff role cannot access staff apps (schedule, admin, …). */
const StaffRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const [redirect, setRedirect] = useState<"account" | "customer-profile-setup" | "shop-setup" | null | "wait">("wait");

  useEffect(() => {
    if (!user) {
      setRedirect(null);
      return;
    }
    let done = false;
    const timer = window.setTimeout(() => {
      if (!done) setRedirect("account");
    }, 2000);

    Promise.all([fetchHasStaffAccess(user.id), fetchIsOnlyCustomer(user.id)])
      .then(async ([isStaff, onlyCustomer]) => {
        done = true;
        window.clearTimeout(timer);

        if (isStaff) {
          const setupRequired = await needsShopSetup(user.id);
          if (setupRequired && location.pathname !== "/shop-setup") {
            setRedirect("shop-setup");
            return;
          }
          setRedirect(null);
          return;
        }

        if (onlyCustomer) {
          const needsSetup = await needsCustomerProfileSetup(user.id);
          setRedirect(needsSetup ? "customer-profile-setup" : "account");
          return;
        }

        setRedirect("account");
      })
      .catch(() => {
        done = true;
        window.clearTimeout(timer);
        setRedirect("account");
      });

    return () => window.clearTimeout(timer);
  }, [user, location.pathname]);

  if (loading || redirect === "wait") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">{t("staff.loading")}</p>
      </div>
    );
  }
  if (redirect === "account") return <Navigate to="/account" replace />;
  if (redirect === "customer-profile-setup")
    return <Navigate to="/customer-profile-setup" replace />;
  if (redirect === "shop-setup") return <Navigate to="/shop-setup" replace />;
  return <>{children}</>;
};

export default StaffRoute;

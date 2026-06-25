import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { fetchHasNoAppRoles, fetchHasStaffAccess, fetchIsOnlyCustomer } from "@/hooks/useUserRoles";
import { isNativeApp } from "@/lib/platform";
import { needsCustomerProfileSetup } from "@/lib/customerProfileSetup";
import { needsShopSetup } from "@/lib/shopSettings";
import { useTranslation } from "react-i18next";

/** Customers without a staff role cannot access staff apps (schedule, admin, …). */
const StaffRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const [redirect, setRedirect] = useState<
    "account" | "customer-profile-setup" | "shop-setup" | "subscribe" | null | "wait"
  >("wait");
  const staffVerifiedRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      staffVerifiedRef.current = false;
      lastUserIdRef.current = null;
      setRedirect(null);
      return;
    }

    if (lastUserIdRef.current !== userId) {
      staffVerifiedRef.current = false;
      lastUserIdRef.current = userId;
    }

    let cancelled = false;
    let done = false;
    let timer: number | undefined;

    const finishShopSetupCheck = async () => {
      const setupRequired = await needsShopSetup(userId);
      if (cancelled) return;
      if (setupRequired && location.pathname !== "/shop-setup") {
        setRedirect("shop-setup");
        return;
      }
      setRedirect(null);
    };

    const run = async () => {
      if (staffVerifiedRef.current) {
        await finishShopSetupCheck();
        return;
      }

      setRedirect("wait");
      timer = window.setTimeout(() => {
        if (!done && !cancelled && !staffVerifiedRef.current) {
          setRedirect("account");
        }
      }, 8000);

      try {
        const [isStaff, onlyCustomer, noAppRoles] = await Promise.all([
          fetchHasStaffAccess(userId),
          fetchIsOnlyCustomer(userId),
          fetchHasNoAppRoles(userId),
        ]);
        if (cancelled) return;
        done = true;
        if (timer) window.clearTimeout(timer);

        if (noAppRoles) {
          setRedirect("subscribe");
          return;
        }

        if (isStaff) {
          const setupRequired = await needsShopSetup(userId);
          if (cancelled) return;
          if (setupRequired && location.pathname !== "/shop-setup") {
            setRedirect("shop-setup");
            return;
          }
          staffVerifiedRef.current = true;
          setRedirect(null);
          return;
        }

        if (onlyCustomer) {
          const needsSetup = await needsCustomerProfileSetup(userId);
          if (cancelled) return;
          setRedirect(needsSetup ? "customer-profile-setup" : "account");
          return;
        }

        setRedirect("account");
      } catch {
        if (cancelled) return;
        done = true;
        if (timer) window.clearTimeout(timer);
        if (!staffVerifiedRef.current) {
          setRedirect("account");
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [userId, location.pathname]);

  if (loading || redirect === "wait") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">{t("staff.loading")}</p>
      </div>
    );
  }
  if (redirect === "account") return <Navigate to="/account" replace />;
  if (redirect === "subscribe") {
    return <Navigate to={isNativeApp() ? "/billing" : "/subscribe?plan=studio"} replace />;
  }
  if (redirect === "customer-profile-setup")
    return <Navigate to="/customer-profile-setup" replace />;
  if (redirect === "shop-setup") return <Navigate to="/shop-setup" replace />;
  return <>{children}</>;
};

export default StaffRoute;

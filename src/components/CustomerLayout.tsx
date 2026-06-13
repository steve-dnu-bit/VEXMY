import { Link, useLocation, useNavigate } from "react-router-dom";
import { Calendar, CreditCard, FileSignature, LogOut, Menu, MessageSquare, Shield, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useState, type CSSProperties } from "react";
import { BRANDING } from "@/lib/branding";
import { useTranslation } from "react-i18next";
import { useCustomerShop } from "@/hooks/useCustomerShop";
import CustomerShopSelector from "@/components/customer/CustomerShopSelector";
import VelbokBrand from "@/components/brand/VelbokBrand";

export interface PortalBrandProfile {
  display_name?: string | null;
  avatar_url?: string | null;
  portal_public_bio?: string | null;
  portal_bg_color?: string | null;
  portal_bg_image_url?: string | null;
  public_contact_email?: string | null;
  public_contact_phone?: string | null;
  public_instagram?: string | null;
}

const CustomerLayoutInner = ({
  children,
  portalBrand,
}: {
  children: React.ReactNode;
  portalBrand?: PortalBrandProfile | null;
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const { t } = useTranslation();
  const { selectedShop, hasMultipleShops } = useCustomerShop();
  const [open, setOpen] = useState(false);

  const items = [
    hasPermission("my_bookings") && { label: t("customer.myBookings"), path: "/account", icon: Calendar },
    hasPermission("my_bookings") && { label: t("customer.depositPayment"), path: "/deposit-payment", icon: CreditCard },
    hasPermission("my_bookings") && { label: t("tickets.customerNav"), path: "/account/tickets", icon: MessageSquare },
    hasPermission("my_bookings") && { label: t("customer.securityTitle"), path: "/account/security", icon: Shield },
    hasPermission("customer_consent") && { label: t("customer.signConsent"), path: "/consent", icon: FileSignature },
  ].filter(Boolean) as Array<{ label: string; path: string; icon: typeof Calendar }>;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const shellStyle = {
    backgroundColor: portalBrand?.portal_bg_color || undefined,
    backgroundImage: portalBrand?.portal_bg_image_url ? `url(${portalBrand.portal_bg_image_url})` : undefined,
    backgroundSize: portalBrand?.portal_bg_image_url ? "cover" : undefined,
    backgroundPosition: portalBrand?.portal_bg_image_url ? "center" : undefined,
  } as CSSProperties;

  const headerTitle = hasMultipleShops && selectedShop ? selectedShop.shopName : BRANDING.platformName.toUpperCase();

  const showPlatformLogo = !(hasMultipleShops && selectedShop);

  return (
    <div className="min-h-screen bg-background flex flex-col" style={shellStyle}>
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4 max-w-lg mx-auto w-full">
          {showPlatformLogo ? (
            <VelbokBrand variant="dashboard" href={null} />
          ) : (
            <span className="font-display font-bold text-gold truncate">{headerTitle}</span>
          )}
          <button type="button" className="md:hidden p-2" onClick={() => setOpen(!open)} aria-label={t("customer.menu")}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <nav className="hidden md:flex items-center gap-1">
            {items.map((item) => {
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                    active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
            <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1 text-muted-foreground">
              <LogOut className="h-4 w-4" /> {t("customer.out")}
            </Button>
          </nav>
        </div>
        {open && (
          <div className="md:hidden border-t border-border px-4 py-3 space-y-1 bg-card">
            {items.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-secondary"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
            <p className="text-xs text-muted-foreground pt-2 truncate">{user?.email}</p>
            <Button variant="outline" size="sm" className="w-full mt-2 gap-2" onClick={handleLogout}>
              <LogOut className="h-4 w-4" /> {t("customer.signOut")}
            </Button>
          </div>
        )}
      </header>
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6 pb-24">
        <CustomerShopSelector />
        {selectedShop?.logoUrl && hasMultipleShops ? (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-border bg-card/90 p-3">
            <img
              src={selectedShop.logoUrl}
              alt={selectedShop.shopName}
              className="h-10 w-10 rounded object-cover border border-border"
            />
            <p className="font-medium">{selectedShop.shopName}</p>
          </div>
        ) : null}
        {portalBrand?.display_name || portalBrand?.portal_public_bio ? (
          <div className="mb-4 rounded-lg border border-border bg-card/90 p-3">
            <div className="flex items-start gap-3">
              {portalBrand.avatar_url ? (
                <img src={portalBrand.avatar_url} alt={t("schedule.artist")} loading="lazy" className="h-12 w-12 rounded-full object-cover border border-border" />
              ) : null}
              <div className="min-w-0">
                {portalBrand.display_name ? <p className="font-medium">{portalBrand.display_name}</p> : null}
                {portalBrand.portal_public_bio ? (
                  <p className="text-xs text-muted-foreground mt-1">{portalBrand.portal_public_bio}</p>
                ) : null}
                {(portalBrand.public_contact_email || portalBrand.public_contact_phone || portalBrand.public_instagram) ? (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {[portalBrand.public_contact_email, portalBrand.public_contact_phone, portalBrand.public_instagram]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
        {children}
        <div className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground space-y-2">
          <div className="flex flex-wrap gap-3">
            <Link to="/terms" className="hover:underline">{t("common.terms")}</Link>
            <Link to="/privacy" className="hover:underline">{t("common.privacy")}</Link>
            <Link to="/cookies" className="hover:underline">{t("common.cookies")}</Link>
          </div>
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => window.dispatchEvent(new CustomEvent("cookie-consent:open"))}
          >
            {t("common.cookieSettings")}
          </button>
        </div>
      </main>
    </div>
  );
};

const CustomerLayout = ({
  children,
  portalBrand,
}: {
  children: React.ReactNode;
  portalBrand?: PortalBrandProfile | null;
}) => <CustomerLayoutInner portalBrand={portalBrand}>{children}</CustomerLayoutInner>;

export default CustomerLayout;

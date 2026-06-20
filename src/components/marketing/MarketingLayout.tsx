import { Link } from "react-router-dom";
import { useState } from "react";
import { Menu, X, Calendar, LayoutDashboard } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { BRANDING } from "@/lib/branding";
import LanguageSelector from "@/components/i18n/LanguageSelector";
import VelbokBrand from "@/components/brand/VelbokBrand";
import VelbokLogo from "@/components/brand/VelbokLogo";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { supabase } from "@/integrations/supabase/client";

const MarketingLayout = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { hasStaffRole, loading: rolesLoading } = useUserRoles();
  const [mobileOpen, setMobileOpen] = useState(false);
  const showStaffNav = !!user && hasStaffRole && !rolesLoading;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setMobileOpen(false);
  };

  const navLinks = [
    { label: t("landing.navProductTour"), href: "/#product-tour" },
    { label: t("common.features"), href: "/#features" },
    { label: t("common.pricing"), href: "/pricing" },
    { label: t("common.documentation"), href: "/docs" },
    { label: t("common.contact"), href: "/contact" },
  ];

  return (
    <div className="relative min-h-screen bg-[#090a0f] text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(212,175,55,0.08),transparent_45%),linear-gradient(180deg,#07080d_0%,#0d0f17_100%)]" />

      <header className="sticky top-0 z-50 border-b border-gold/30 bg-[#090a0f]/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <VelbokBrand variant="marketing" href="/" showTagline />

          <nav className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-gold"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <LanguageSelector compact />
            {showStaffNav ? (
              <>
                <Button variant="ghost" asChild className="text-muted-foreground hover:text-foreground">
                  <Link to="/schedule">
                    <Calendar className="h-4 w-4 mr-1.5" />
                    {t("nav.schedule")}
                  </Link>
                </Button>
                <Button variant="gold-outline" asChild>
                  <Link to="/dashboard">
                    <LayoutDashboard className="h-4 w-4 mr-1.5" />
                    {t("nav.dashboard")}
                  </Link>
                </Button>
                <Button variant="ghost" onClick={() => void handleSignOut()} className="text-muted-foreground hover:text-foreground">
                  {t("common.signOut")}
                </Button>
              </>
            ) : user ? (
              <>
                <Button variant="ghost" asChild className="text-muted-foreground hover:text-foreground">
                  <Link to="/subscribe">{t("common.startFreeTrial")}</Link>
                </Button>
                <Button variant="ghost" onClick={() => void handleSignOut()} className="text-muted-foreground hover:text-foreground">
                  {t("common.signOut")}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" asChild className="text-muted-foreground hover:text-foreground">
                  <Link to="/auth">{t("common.signIn")}</Link>
                </Button>
                <Button variant="gold" asChild>
                  <Link to="/subscribe">{t("common.startFreeTrial")}</Link>
                </Button>
              </>
            )}
          </div>

          <button
            type="button"
            className="md:hidden text-foreground"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={t("common.toggleMenu")}
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileOpen ? (
          <div className="border-t border-gold/30 bg-[#090a0f] px-4 py-4 md:hidden">
            <div className="flex flex-col gap-3">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className="text-sm text-muted-foreground"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <LanguageSelector compact className="w-full" />
              {showStaffNav ? (
                <>
                  <Link to="/schedule" className="text-sm font-medium text-gold" onClick={() => setMobileOpen(false)}>
                    {t("nav.schedule")}
                  </Link>
                  <Link to="/dashboard" className="text-sm text-muted-foreground" onClick={() => setMobileOpen(false)}>
                    {t("nav.dashboard")}
                  </Link>
                  <button
                    type="button"
                    className="text-left text-sm text-muted-foreground"
                    onClick={() => void handleSignOut()}
                  >
                    {t("common.signOut")}
                  </button>
                </>
              ) : user ? (
                <button
                  type="button"
                  className="text-left text-sm text-muted-foreground"
                  onClick={() => void handleSignOut()}
                >
                  {t("common.signOut")}
                </button>
              ) : (
                <Link to="/auth" className="text-sm text-muted-foreground" onClick={() => setMobileOpen(false)}>
                  {t("common.signIn")}
                </Link>
              )}
            </div>
          </div>
        ) : null}
      </header>

      <main className="relative z-10">{children}</main>

      <footer className="relative z-10 border-t border-gold/30 bg-[#07080d]">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
          <div className="md:col-span-2">
            <VelbokLogo size="sm" href={null} className="mb-2" />
            <p className="font-display text-lg font-semibold text-gold">{BRANDING.platformName}</p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{t("marketing.footerTagline")}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gold/80">{t("common.product")}</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><Link to="/#features" className="hover:text-foreground">{t("common.features")}</Link></li>
              <li><Link to="/pricing" className="hover:text-foreground">{t("common.pricing")}</Link></li>
              <li><Link to="/docs" className="hover:text-foreground">{t("common.documentation")}</Link></li>
              <li><Link to="/download" className="hover:text-foreground">{t("common.downloadApp")}</Link></li>
              <li><Link to="/contact" className="hover:text-foreground">{t("common.contact")}</Link></li>
              <li><Link to="/auth" className="hover:text-foreground">{t("common.studioLogin")}</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gold/80">{t("common.legal")}</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><Link to="/terms" className="hover:text-foreground">{t("common.terms")}</Link></li>
              <li><Link to="/privacy" className="hover:text-foreground">{t("common.privacy")}</Link></li>
              <li><Link to="/cookies" className="hover:text-foreground">{t("common.cookies")}</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} {BRANDING.platformName}. {t("common.allRightsReserved")}
        </div>
      </footer>
    </div>
  );
};

export default MarketingLayout;

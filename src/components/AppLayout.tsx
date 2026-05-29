import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Calendar, MessageSquare, Image, LayoutDashboard, LogOut, Menu, X, Users, Briefcase, PoundSterling, Building2, Package, Shield, Settings, FileSignature } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions, type Feature } from "@/hooks/usePermissions";
import { getThemePresetByBgColor } from "@/lib/themePresets";
import { readCachedPortalTheme, writeCachedPortalTheme } from "@/lib/artistThemeCache";
import { BRANDING, STORAGE_PREFIX } from "@/lib/branding";

const allNavItems: Array<{ label: string; path: string; icon: any; feature: Feature }> = [
  { label: "Schedule", path: "/schedule", icon: Calendar, feature: "schedule" },
  { label: "Inbox", path: "/inbox", icon: MessageSquare, feature: "inbox" },
  { label: "Services", path: "/services", icon: Briefcase, feature: "services" },
  { label: "Stencil", path: "/stencil", icon: Image, feature: "stencil" },
  { label: "Clients", path: "/clients", icon: Users, feature: "clients" },
  { label: "Stock", path: "/stock", icon: Package, feature: "stock" },
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, feature: "dashboard" },
  { label: "Settings", path: "/settings", icon: Settings, feature: "settings" },
  { label: "Deposits", path: "/deposits", icon: PoundSterling, feature: "deposits" },
  { label: "Billing", path: "/billing", icon: Building2, feature: "billing" },
  { label: "Admin", path: "/admin", icon: Shield, feature: "admin" },
  { label: "Consent form", path: "/consent", icon: FileSignature, feature: "customer_consent" },
];

function hexToHslVars(hex: string): { primary: string; ring: string; sidebarPrimary: string } | null {
  const clean = hex.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const hStr = Math.round(h);
  const sStr = Math.round(s * 100);
  const lStr = Math.round(l * 100);
  const base = `${hStr} ${sStr}% ${lStr}%`;
  return { primary: base, ring: base, sidebarPrimary: base };
}

function clearPortalTheme() {
  const root = document.documentElement;
  root.style.removeProperty("--primary");
  root.style.removeProperty("--ring");
  root.style.removeProperty("--sidebar-primary");
  root.style.removeProperty("--accent");
  document.body.style.removeProperty("backgroundColor");
  document.body.style.removeProperty("backgroundImage");
  document.body.style.removeProperty("backgroundSize");
  document.body.style.removeProperty("backgroundPosition");
  document.body.style.removeProperty("backgroundAttachment");
}

function applyPortalTheme(color: string | null, imageUrl: string | null) {
  const root = document.documentElement;
  const preset = getThemePresetByBgColor(color);
  const vars = preset ? hexToHslVars(preset.accentColor) : color ? hexToHslVars(color) : null;
  if (vars) {
    root.style.setProperty("--primary", vars.primary);
    root.style.setProperty("--ring", vars.ring);
    root.style.setProperty("--sidebar-primary", vars.sidebarPrimary);
    root.style.setProperty("--accent", vars.primary);
  } else {
    root.style.removeProperty("--primary");
    root.style.removeProperty("--ring");
    root.style.removeProperty("--sidebar-primary");
    root.style.removeProperty("--accent");
  }

  if (color) document.body.style.backgroundColor = color;
  else document.body.style.removeProperty("backgroundColor");

  if (imageUrl) {
    document.body.style.backgroundImage = `url(${imageUrl})`;
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundPosition = "center";
    document.body.style.backgroundAttachment = "fixed";
  } else {
    document.body.style.removeProperty("backgroundImage");
    document.body.style.removeProperty("backgroundSize");
    document.body.style.removeProperty("backgroundPosition");
    document.body.style.removeProperty("backgroundAttachment");
  }
}

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}.sidebarCollapsed`);
    return raw === "1";
  });
  const [portalBgColor, setPortalBgColor] = useState<string | null>(null);
  const [portalBgImageUrl, setPortalBgImageUrl] = useState<string | null>(null);

  const navItems = allNavItems.filter((item) => hasPermission(item.feature));

  useLayoutEffect(() => {
    if (!user?.id) return;
    const cached = readCachedPortalTheme(user.id);
    if (!cached) return;
    setPortalBgColor(cached.color);
    setPortalBgImageUrl(cached.image);
    applyPortalTheme(cached.color, cached.image);
  }, [user?.id]);

  useEffect(() => {
    const fetchAndApplyTheme = async () => {
      if (!user) {
        setPortalBgColor(null);
        setPortalBgImageUrl(null);
        clearPortalTheme();
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("portal_bg_color, portal_bg_image_url")
        .eq("user_id", user.id)
        .maybeSingle();
      const color = data?.portal_bg_color || null;
      const image = data?.portal_bg_image_url || null;
      setPortalBgColor(color);
      setPortalBgImageUrl(image);
      applyPortalTheme(color, image);
      writeCachedPortalTheme(user.id, { color, image });
    };

    void fetchAndApplyTheme();
    window.addEventListener("focus", fetchAndApplyTheme);
    return () => window.removeEventListener("focus", fetchAndApplyTheme);
  }, [user, location.pathname]);

  const shellStyle = useMemo(() => {
    const preset = getThemePresetByBgColor(portalBgColor);
    const vars = preset
      ? hexToHslVars(preset.accentColor)
      : portalBgColor
        ? hexToHslVars(portalBgColor)
        : null;
    return {
      backgroundColor: portalBgColor || undefined,
      backgroundImage: portalBgImageUrl ? `url(${portalBgImageUrl})` : undefined,
      backgroundSize: portalBgImageUrl ? "cover" : undefined,
      backgroundPosition: portalBgImageUrl ? "center" : undefined,
      ["--primary" as string]: vars?.primary,
      ["--ring" as string]: vars?.ring,
      ["--sidebar-primary" as string]: vars?.sidebarPrimary,
      ["--accent" as string]: vars?.primary,
    } as CSSProperties;
  }, [portalBgColor, portalBgImageUrl]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const toggleDesktopSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem(`${STORAGE_PREFIX}.sidebarCollapsed`, next ? "1" : "0");
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden" style={shellStyle}>
      {/* Mobile header */}
      <div className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-border bg-background/95 backdrop-blur px-4 md:hidden">
        <button onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <span className="font-display text-lg font-bold text-gradient-gold">{BRANDING.platformName.toUpperCase()}</span>
        <div className="w-5" />
      </div>

      {/* Sidebar */}
      <aside
        className={`themed-scrollbar fixed inset-y-0 left-0 z-40 overflow-y-scroll overflow-x-hidden border-r border-sidebar-border bg-sidebar flex flex-col transition-all duration-200 md:relative md:translate-x-0 ${
          sidebarCollapsed ? "md:w-16" : "md:w-56"
        } ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-3 py-3 border-b border-sidebar-border">
          <div className={`flex items-center ${sidebarCollapsed ? "justify-center" : "justify-between"} gap-2`}>
            {!sidebarCollapsed ? (
              <span className="font-display text-lg font-bold text-gradient-gold">{BRANDING.platformName.toUpperCase()}</span>
            ) : (
              <span className="font-display text-lg font-bold text-gradient-gold">I</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="hidden md:inline-flex h-8 w-8 p-0 text-muted-foreground"
              onClick={toggleDesktopSidebar}
              title={sidebarCollapsed ? "Expand menu" : "Collapse menu"}
              aria-label={sidebarCollapsed ? "Expand menu" : "Collapse menu"}
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className={`mt-2 w-full gap-2 text-muted-foreground ${sidebarCollapsed ? "justify-center px-0" : "justify-start"}`}
            onClick={handleLogout}
            title="Sign Out"
          >
            <LogOut className="h-4 w-4" />
            {!sidebarCollapsed && <span>Sign Out</span>}
          </Button>
        </div>

        <nav className="flex-1 py-4 space-y-1 px-3">
          {navItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                title={item.label}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                } ${sidebarCollapsed ? "justify-center px-3" : ""}`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!sidebarCollapsed && item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-sidebar-border space-y-2">
          {!sidebarCollapsed ? (
            <>
              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <Link to="/terms" className="hover:underline">Terms</Link>
                <Link to="/privacy" className="hover:underline">Privacy</Link>
                <Link to="/cookies" className="hover:underline">Cookies</Link>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs text-muted-foreground"
                onClick={() => window.dispatchEvent(new CustomEvent("cookie-consent:open"))}
              >
                Cookie settings
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-center text-muted-foreground"
              title="Cookie settings"
              aria-label="Cookie settings"
              onClick={() => window.dispatchEvent(new CustomEvent("cookie-consent:open"))}
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-background/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  );
};

export default AppLayout;

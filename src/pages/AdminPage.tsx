import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { STAFF_FEATURES, CUSTOMER_FEATURES } from "@/hooks/usePermissions";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, Crown, Shield, Check, X, Users, Mail, UserPlus, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildScheduleCSV, buildScheduleJSON, parseScheduleCSV, parseScheduleJSON, type ScheduleBookingPayload } from "@/lib/schedule-io";
import { endOfMonth, startOfMonth } from "date-fns";
import { Link, useSearchParams } from "react-router-dom";
import { useArtistSeats } from "@/hooks/useSubscription";
import { usePlatformAdminAccess } from "@/hooks/usePlatformAdmin";
import { getPlanById } from "@/lib/pricingPlans";
import { useTranslation } from "react-i18next";
import { fetchIsPlatformAdmin } from "@/lib/platformAdmin";
import i18n from "@/i18n";
import {
  loadAdminTeamData,
  type AdminDefaultRow,
  type AdminPermission,
  type AdminProfile,
} from "@/lib/adminTeamData";

const SubscriptionSettingsCard = lazy(() => import("@/components/subscription/SubscriptionSettingsCard"));
const StripeConnectCard = lazy(() => import("@/components/subscription/StripeConnectCard"));
const AdminConsentsPanel = lazy(() => import("@/components/admin/AdminConsentsPanel"));
const AdminEmailSettingsPanel = lazy(() => import("@/components/admin/AdminEmailSettingsPanel"));
const AdminAftercareSettingsPanel = lazy(() => import("@/components/admin/AdminAftercareSettingsPanel"));
const AdminConsentFormsPanel = lazy(() => import("@/components/admin/AdminConsentFormsPanel"));
const AdminScheduleHoursPanel = lazy(() => import("@/components/admin/AdminScheduleHoursPanel"));
const AdminDashboardThemePanel = lazy(() => import("@/components/admin/AdminDashboardThemePanel"));
const AdminWebsiteEmbedPanel = lazy(() => import("@/components/admin/AdminWebsiteEmbedPanel"));
const AdminPosCheckoutPanel = lazy(() => import("@/components/admin/AdminPosCheckoutPanel"));
const AdminArtistPrivacyPanel = lazy(() => import("@/components/admin/AdminArtistPrivacyPanel"));

const ADMIN_TABS = [
  "defaults",
  "staff",
  "artist-privacy",
  "customers",
  "consents",
  "consent-forms",
  "emails",
  "aftercare",
  "schedule-hours",
  "dashboard-theme",
  "website-embed",
  "pos-checkout",
] as const;

type AdminTab = (typeof ADMIN_TABS)[number];

const TabPanelFallback = () => {
  const { t } = useTranslation();
  return <p className="text-sm text-muted-foreground py-8 text-center">{t("common.loading")}</p>;
};

function LazyAdminTab({
  tab,
  activeTab,
  title,
  children,
}: {
  tab: AdminTab;
  activeTab: AdminTab;
  title: string;
  children: React.ReactNode;
}) {
  if (activeTab !== tab) return null;
  return (
    <TabsContent value={tab} className="mt-4">
      <AdminSectionErrorBoundary title={title}>
        <Suspense fallback={<TabPanelFallback />}>{children}</Suspense>
      </AdminSectionErrorBoundary>
    </TabsContent>
  );
}

class AdminSectionErrorBoundary extends React.Component<
  { title: string; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { title: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{this.props.title}</CardTitle>
            <CardDescription>{i18n.t("errors.adminSectionFailed")}</CardDescription>
          </CardHeader>
        </Card>
      );
    }
    return this.props.children;
  }
}

class AdminPageErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || "Unknown error" };
  }

  render() {
    if (this.state.hasError) {
      return (
        <AppLayout>
          <div className="flex flex-col items-center justify-center h-[60vh] gap-3 p-6 text-center">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <p className="font-medium">{i18n.t("errors.adminPageFailed")}</p>
            <p className="text-sm text-muted-foreground max-w-md">{this.state.message}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              {i18n.t("routeError.refresh")}
            </Button>
          </div>
        </AppLayout>
      );
    }
    return this.props.children;
  }
}

const AdminPage = () => {
  const { t } = useTranslation();
  const staffFeatureLabel = (f: string) => t(`nav.${f}`);
  const customerFeatureLabel = (f: string) =>
    f === "my_bookings" ? t("admin.featureMyBookings") : t("admin.featureConsentLink");
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: AdminTab = ADMIN_TABS.includes(tabParam as AdminTab) ? (tabParam as AdminTab) : "defaults";
  const { data: seatUsage, refetch: refetchSeats } = useArtistSeats();
  const { data: isPlatformAdmin } = usePlatformAdminAccess();
  const [isAdmin, setIsAdmin] = useState(false);
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);
  const [rolesByUser, setRolesByUser] = useState<Record<string, string[]>>({});
  const [defaults, setDefaults] = useState<AdminDefaultRow[]>([]);
  const [hasOrganization, setHasOrganization] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    const loadTeam = async () => {
      setTeamLoading(true);
      try {
        const teamData = await loadAdminTeamData();
        if (cancelled) return;
        setProfiles(teamData.profiles);
        setPermissions(teamData.permissions);
        setRolesByUser(teamData.rolesByUser);
        setDefaults(teamData.defaults);
        setHasOrganization(teamData.hasOrganization);
      } catch (e) {
        if (!cancelled) {
          console.warn("Admin team load failed:", e);
        }
      } finally {
        if (!cancelled) setTeamLoading(false);
      }
    };

    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [adminRes, adminPermRes, platformAdminFlag] = await Promise.all([
          supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
          supabase.rpc("has_permission", { _user_id: userId, _feature: "admin" }),
          fetchIsPlatformAdmin(userId),
        ]);
        if (cancelled) return;

        setIsAdmin(!!adminRes.data || !!adminPermRes.data || platformAdminFlag);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : i18n.t("errors.adminDataFailed"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }

      void loadTeam();
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const fetchData = async () => {
    setTeamLoading(true);
    try {
      const teamData = await loadAdminTeamData();
      setProfiles(teamData.profiles);
      setPermissions(teamData.permissions);
      setRolesByUser(teamData.rolesByUser);
      setDefaults(teamData.defaults);
      setHasOrganization(teamData.hasOrganization);
    } finally {
      setTeamLoading(false);
    }
  };

  const isPureCustomer = (userId: string) => {
    const r = rolesByUser[userId] || [];
    return r.length === 1 && r[0] === "customer";
  };

  const staffProfiles = profiles.filter((p) => !isPureCustomer(p.user_id));
  const customerProfiles = profiles.filter((p) => isPureCustomer(p.user_id));

  const hasArtistRole = (userId: string) => (rolesByUser[userId] || []).includes("artist");
  const hasAdminRole = (userId: string) => (rolesByUser[userId] || []).includes("admin");

  const canRemoveArtistFromShop = (userId: string) => {
    if (!user || userId === user.id) return false;
    return hasArtistRole(userId);
  };

  const hasFeature = (userId: string, feature: string) =>
    permissions.some((p) => p.user_id === userId && p.feature === feature && p.granted);

  const togglePermission = async (userId: string, feature: string) => {
    const current = hasFeature(userId, feature);
    const { error } = await supabase
      .from("user_permissions")
      .upsert({ user_id: userId, feature, granted: !current }, { onConflict: "user_id,feature" });
    if (error) {
      toast.error(t("admin.failedUpdatePermission"));
      return;
    }
    toast.success(!current ? t("admin.grantedFeature", { feature }) : t("admin.revokedFeature", { feature }));
    fetchData();
  };

  const toggleAllStaff = async (userId: string, grant: boolean) => {
    const upserts = STAFF_FEATURES.map((f) => ({ user_id: userId, feature: f, granted: grant }));
    const { error } = await supabase.from("user_permissions").upsert(upserts, { onConflict: "user_id,feature" });
    if (error) {
      toast.error(t("admin.failedUpdatePermissions"));
      return;
    }
    toast.success(grant ? t("admin.grantedAllStaffFeatures") : t("admin.revokedAllStaffFeatures"));
    fetchData();
  };

  const toggleDefault = async (roleTemplate: "customer" | "artist", feature: string, granted: boolean) => {
    const { error } = await supabase
      .from("permission_role_defaults")
      .upsert({ role_template: roleTemplate, feature, granted }, { onConflict: "role_template,feature" });
    if (error) {
      toast.error(t("admin.failedSaveDefault"));
      return;
    }
    setDefaults((d) => {
      const next = d.filter((x) => !(x.role_template === roleTemplate && x.feature === feature));
      return [...next, { role_template: roleTemplate, feature, granted }];
    });
    toast.success(t("admin.defaultUpdated"));
  };

  const defaultGranted = (roleTemplate: string, feature: string) =>
    defaults.some((d) => d.role_template === roleTemplate && d.feature === feature && d.granted);

  const removeArtistFromShop = async (profile: AdminProfile) => {
    const name = profile.display_name || t("admin.user");
    const adminNote = hasAdminRole(profile.user_id)
      ? ` ${t("admin.removeArtistKeepsAdminNote")}`
      : "";
    if (!window.confirm(t("admin.removeArtistConfirm", { name }) + adminNote)) return;

    setRemovingUserId(profile.user_id);
    try {
      const { data, error } = await supabase.functions.invoke("remove-shop-artist", {
        body: { userId: profile.user_id },
      });
      if (error) {
        toast.error(error.message || t("admin.removeArtistFailed"));
        return;
      }
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      toast.success(
        data?.keptAdminAccess
          ? t("admin.removeArtistSuccessAdmin", { name })
          : t("admin.removeArtistSuccess", { name }),
      );
      await Promise.all([fetchData(), refetchSeats()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("admin.removeArtistFailed"));
    } finally {
      setRemovingUserId(null);
    }
  };

  const sendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error(t("admin.invalidEmail"));
      return;
    }
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email,
          inviteType: "artist",
          redirectTo: `${window.location.origin.replace(/\/$/, "")}/auth?next=/artist-profile-settings`,
        },
      });
      if (error) {
        toast.error(error.message || t("admin.inviteFailed"));
        return;
      }
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      toast.success(t("admin.inviteSent", { email }));
      setInviteEmail("");
      void refetchSeats();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("admin.inviteFailed"));
    } finally {
      setInviting(false);
    }
  };

  const exportSchedule = async (format: "json" | "csv") => {
    const from = startOfMonth(new Date());
    const to = endOfMonth(new Date());
    to.setHours(23, 59, 59, 999);
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .gte("starts_at", from.toISOString())
      .lte("starts_at", to.toISOString())
      .order("starts_at");
    if (error) return toast.error(error.message);
    const rows = (data || []) as ScheduleBookingPayload[];
    const out = format === "json" ? buildScheduleJSON(rows) : buildScheduleCSV(rows);
    const blob = new Blob([out], { type: format === "json" ? "application/json" : "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedule-admin-${new Date().toISOString().slice(0, 10)}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("admin.exportedBookings", { count: rows.length }));
  };

  const importSchedule = async (file: File) => {
    const text = await file.text();
    let rows: ScheduleBookingPayload[] = [];
    try {
      rows = file.name.endsWith(".csv") ? parseScheduleCSV(text) : parseScheduleJSON(text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("admin.failedImportExport"));
      return;
    }
    const batch = rows.map((r) => ({
      artist_id: user?.id,
      client_name: r.client_name,
      client_email: r.client_email ?? null,
      client_phone: r.client_phone ?? null,
      tattoo_style: r.tattoo_style ?? null,
      tattoo_size: r.tattoo_size ?? null,
      tattoo_placement: r.tattoo_placement ?? null,
      notes: r.notes ?? null,
      booking_type: r.booking_type || "session",
      status: r.status || "confirmed",
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      deposit_paid: r.deposit_paid ?? null,
      suppress_booking_notifications: true,
    }));
    const { error } = await supabase.from("bookings").insert(batch);
    if (error) return toast.error(error.message);
    toast.success(t("admin.importedBookings", { count: batch.length }));
  };

  const resetSchedule = async () => {
    if (!window.confirm(t("admin.deleteAllBookingsConfirm"))) return;
    const { error } = await supabase.from("bookings").delete().not("created_at", "is", null);
    if (error) return toast.error(error.message);
    toast.success(t("admin.scheduleReset"));
  };
  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
        </div>
      </AppLayout>
    );
  }

  if (loadError) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-3 p-6 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="font-medium">{i18n.t("errors.adminDataFailed")}</p>
          <p className="text-sm text-muted-foreground max-w-md">{loadError}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            {t("routeError.refresh")}
          </Button>
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">{t("admin.accessRequired")}</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto overflow-x-hidden pb-24">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" /> {t("admin.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("admin.subtitle")}</p>
        </div>

        {!hasOrganization ? (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("admin.noStudioTitle")}</CardTitle>
              <CardDescription>
                {t("admin.noStudioDesc")}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {isPlatformAdmin ? (
          <Card className="border-gold/40 bg-gold/5">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-gold" />
                  <CardTitle className="text-base">{t("platformAdmin.title")}</CardTitle>
                </div>
                <Button variant="gold" size="sm" asChild>
                  <Link to="/platform">{t("platformAdmin.openDashboard")}</Link>
                </Button>
              </div>
              <CardDescription>{t("platformAdmin.adminCardDesc")}</CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        <Card className="border-teal-900/30 bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-teal-500" />
              <CardTitle className="text-base">{t("admin.inviteTitle")}</CardTitle>
            </div>
            <CardDescription>
              {t("admin.inviteDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md">
            {seatUsage && seatUsage.max != null ? (
              <div className="rounded-lg border border-border/70 bg-secondary/70 px-3 py-2 text-sm">
                <p className="font-medium">
                  {t("admin.artistSeats", { used: seatUsage.used, max: seatUsage.max })}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {getPlanById(seatUsage.planId ?? "")?.name ?? "Current"} plan
                  {!seatUsage.canAdd ? t("admin.limitReached") : ""}
                </p>
                {!seatUsage.canAdd ? (
                  <Button variant="link" className="h-auto p-0 mt-2 text-gold" asChild>
                    <a href="#subscription">{t("admin.upgradeSeats")}</a>
                  </Button>
                ) : null}
              </div>
            ) : null}
            <div>
              <Label htmlFor="inv-email">{t("common.email")}</Label>
              <Input
                id="inv-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="newuser@example.com"
                className="mt-1"
              />
            </div>
            <Button onClick={sendInvite} disabled={inviting || seatUsage?.canAdd === false} className="gap-2">
              <UserPlus className="h-4 w-4" />
              {inviting ? t("contact.sending") : seatUsage?.canAdd === false ? t("admin.seatLimitReached") : t("admin.sendArtistInvite")}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">{t("admin.scheduleToolsTitle")}</CardTitle>
            <CardDescription>{t("admin.scheduleToolsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              ref={(el) => (importInputRef.current = el)}
              type="file"
              accept=".json,.csv,application/json,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importSchedule(file);
                e.currentTarget.value = "";
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => exportSchedule("json")}>{t("admin.exportJson")}</Button>
              <Button variant="outline" onClick={() => exportSchedule("csv")}>{t("admin.exportCsv")}</Button>
              <Button variant="outline" onClick={() => importInputRef.current?.click()}>{t("admin.import")}</Button>
              <Button variant="destructive" onClick={resetSchedule}>{t("admin.resetSchedule")}</Button>
            </div>
          </CardContent>
        </Card>
        <Tabs
          value={activeTab}
          onValueChange={(value) => setSearchParams({ tab: value }, { replace: true })}
          className="w-full"
        >
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="defaults">{t("admin.tabDefaults")}</TabsTrigger>
            <TabsTrigger value="staff">{t("admin.tabStaff")}</TabsTrigger>
            <TabsTrigger value="artist-privacy">{t("admin.tabArtistPrivacy")}</TabsTrigger>
            <TabsTrigger value="customers">{t("admin.tabCustomers")}</TabsTrigger>
            <TabsTrigger value="consents">{t("admin.tabConsents")}</TabsTrigger>
            <TabsTrigger value="consent-forms">{t("admin.tabConsentForms")}</TabsTrigger>
            <TabsTrigger value="emails">{t("admin.tabEmails")}</TabsTrigger>
            <TabsTrigger value="aftercare">{t("admin.tabAftercare")}</TabsTrigger>
            <TabsTrigger value="schedule-hours">{t("admin.tabScheduleHours")}</TabsTrigger>
            <TabsTrigger value="dashboard-theme">{t("admin.tabDashboardTheme")}</TabsTrigger>
            <TabsTrigger value="website-embed">{t("admin.tabWebsiteEmbed")}</TabsTrigger>
            <TabsTrigger value="pos-checkout">{t("admin.tabPosCheckout")}</TabsTrigger>
          </TabsList>

          <TabsContent value="defaults" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              {t("admin.defaultsApplyNote")}
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="h-4 w-4" /> {t("admin.customerDefaults")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {CUSTOMER_FEATURES.map((f) => (
                    <div key={f} className="flex items-center justify-between gap-2 py-1">
                      <span className="text-sm">{customerFeatureLabel(f)}</span>
                      <Button
                        size="sm"
                        variant={defaultGranted("customer", f) ? "default" : "outline"}
                        className="h-8 w-8 p-0"
                        onClick={() => toggleDefault("customer", f, !defaultGranted("customer", f))}
                      >
                        {defaultGranted("customer", f) ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5 opacity-40" />}
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4" /> {t("admin.artistDefaults")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 max-h-[320px] overflow-y-auto">
                  {STAFF_FEATURES.map((f) => (
                    <div key={f} className="flex items-center justify-between gap-2 py-0.5">
                      <span className="text-xs">{staffFeatureLabel(f)}</span>
                      <Button
                        size="sm"
                        variant={defaultGranted("artist", f) ? "default" : "outline"}
                        className="h-7 w-7 p-0 shrink-0"
                        onClick={() => toggleDefault("artist", f, !defaultGranted("artist", f))}
                      >
                        {defaultGranted("artist", f) ? <Check className="h-3 w-3" /> : <X className="h-3 w-3 opacity-40" />}
                      </Button>
                    </div>
                  ))}
                  {CUSTOMER_FEATURES.map((f) => (
                    <div key={`a-${f}`} className="flex items-center justify-between gap-2 py-0.5 border-t border-border mt-2 pt-2">
                      <span className="text-xs text-muted-foreground">{customerFeatureLabel(f)} ({t("admin.customerNav")})</span>
                      <Button
                        size="sm"
                        variant={defaultGranted("artist", f) ? "default" : "outline"}
                        className="h-7 w-7 p-0 shrink-0"
                        onClick={() => toggleDefault("artist", f, !defaultGranted("artist", f))}
                      >
                        {defaultGranted("artist", f) ? <Check className="h-3 w-3" /> : <X className="h-3 w-3 opacity-40" />}
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="staff" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("admin.staffFeatureAccess")}</CardTitle>
                <CardDescription>{t("admin.staffFeatureAccessDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {teamLoading ? (
                  <p className="p-6 text-sm text-muted-foreground text-center">{t("common.loading")}</p>
                ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-card z-10 min-w-[120px]">{t("admin.user")}</TableHead>
                      {STAFF_FEATURES.map((f) => (
                        <TableHead key={f} className="text-center text-[10px] px-1 min-w-[56px]">
                          {staffFeatureLabel(f)}
                        </TableHead>
                      ))}
                      <TableHead className="text-center text-[10px] px-2">{t("admin.all")}</TableHead>
                      <TableHead className="text-center text-[10px] px-2 min-w-[72px]">{t("admin.remove")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staffProfiles.map((profile) => {
                      const allGranted = STAFF_FEATURES.every((f) => hasFeature(profile.user_id, f));
                      const removable = canRemoveArtistFromShop(profile.user_id);
                      return (
                        <TableRow key={profile.user_id}>
                          <TableCell className="sticky left-0 bg-card z-10 font-medium text-sm">
                            <span>{profile.display_name}</span>
                            {hasAdminRole(profile.user_id) ? (
                              <span className="ml-1.5 text-[10px] text-muted-foreground uppercase">{t("nav.admin")}</span>
                            ) : null}
                          </TableCell>
                          {STAFF_FEATURES.map((feature) => {
                            const granted = hasFeature(profile.user_id, feature);
                            return (
                              <TableCell key={feature} className="text-center px-1">
                                <Button
                                  size="sm"
                                  variant={granted ? "default" : "outline"}
                                  className={`h-7 w-7 p-0 ${granted ? "bg-emerald-600 hover:bg-emerald-700" : "opacity-40"}`}
                                  onClick={() => togglePermission(profile.user_id, feature)}
                                >
                                  {granted ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                                </Button>
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-center px-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px] px-2"
                              onClick={() => toggleAllStaff(profile.user_id, !allGranted)}
                            >
                              {allGranted ? t("admin.revoke") : t("admin.grantAll")}
                            </Button>
                          </TableCell>
                          <TableCell className="text-center px-2">
                            {removable ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px] px-2 text-destructive border-destructive/40 hover:bg-destructive/10"
                                disabled={removingUserId === profile.user_id}
                                onClick={() => void removeArtistFromShop(profile)}
                              >
                                <UserMinus className="h-3.5 w-3.5 mr-0.5" />
                                {removingUserId === profile.user_id ? "…" : t("admin.remove")}
                              </Button>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="customers" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("admin.customerAccountsTitle")}</CardTitle>
                <CardDescription>{t("admin.customerAccountsDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {teamLoading ? (
                  <p className="p-6 text-sm text-muted-foreground text-center">{t("common.loading")}</p>
                ) : customerProfiles.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground text-center">{t("admin.noCustomerAccounts")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("common.name")}</TableHead>
                        <TableHead className="text-center">{t("admin.myBookings")}</TableHead>
                        <TableHead className="text-center">{t("admin.consent")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customerProfiles.map((profile) => (
                        <TableRow key={profile.user_id}>
                          <TableCell className="font-medium">{profile.display_name}</TableCell>
                          {CUSTOMER_FEATURES.map((feature) => (
                            <TableCell key={feature} className="text-center">
                              <Button
                                size="sm"
                                variant={hasFeature(profile.user_id, feature) ? "default" : "outline"}
                                className="h-7 w-7 p-0"
                                onClick={() => togglePermission(profile.user_id, feature)}
                              >
                                {hasFeature(profile.user_id, feature) ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <X className="h-3 w-3 opacity-40" />
                                )}
                              </Button>
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <LazyAdminTab tab="artist-privacy" activeTab={activeTab} title={t("admin.tabArtistPrivacy")}>
            <AdminArtistPrivacyPanel />
          </LazyAdminTab>

          <LazyAdminTab tab="consents" activeTab={activeTab} title={t("admin.tabConsents")}>
            <AdminConsentsPanel />
          </LazyAdminTab>

          <LazyAdminTab tab="consent-forms" activeTab={activeTab} title={t("admin.tabConsentForms")}>
            <AdminConsentFormsPanel />
          </LazyAdminTab>

          <LazyAdminTab tab="emails" activeTab={activeTab} title={t("admin.tabEmails")}>
            <AdminEmailSettingsPanel />
          </LazyAdminTab>

          <LazyAdminTab tab="aftercare" activeTab={activeTab} title={t("admin.tabAftercare")}>
            <AdminAftercareSettingsPanel />
          </LazyAdminTab>

          <LazyAdminTab tab="schedule-hours" activeTab={activeTab} title={t("admin.tabScheduleHours")}>
            <AdminScheduleHoursPanel />
          </LazyAdminTab>

          <LazyAdminTab tab="dashboard-theme" activeTab={activeTab} title={t("admin.tabDashboardTheme")}>
            <AdminDashboardThemePanel />
          </LazyAdminTab>

          <LazyAdminTab tab="website-embed" activeTab={activeTab} title={t("admin.tabWebsiteEmbed")}>
            <AdminWebsiteEmbedPanel />
          </LazyAdminTab>

          <LazyAdminTab tab="pos-checkout" activeTab={activeTab} title={t("admin.tabPosCheckout")}>
            <AdminPosCheckoutPanel />
          </LazyAdminTab>
        </Tabs>

        <div id="subscription" className="scroll-mt-6 space-y-6">
          <AdminSectionErrorBoundary title={t("subscription.title")}>
            <Suspense fallback={<TabPanelFallback />}>
              <SubscriptionSettingsCard />
            </Suspense>
          </AdminSectionErrorBoundary>
          <div id="payouts" className="scroll-mt-6">
            <AdminSectionErrorBoundary title={t("stripeConnect.title")}>
              <Suspense fallback={<TabPanelFallback />}>
                <StripeConnectCard returnPath="/admin" refreshPath="/admin" />
              </Suspense>
            </AdminSectionErrorBoundary>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

const AdminPageWithBoundary = () => (
  <AdminPageErrorBoundary>
    <AdminPage />
  </AdminPageErrorBoundary>
);

export default AdminPageWithBoundary;

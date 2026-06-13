import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  Building2,
  Crown,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
  Shield,
  Users,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import VelbokBrand from "@/components/brand/VelbokBrand";
import {
  type PlatformStudio,
  useGrantPlatformSubscription,
  usePlatformAdminAccess,
  usePlatformEvents,
  usePlatformOverview,
  usePlatformStudios,
  usePlatformUsers,
  useSetPlatformSubscriptionStatus,
} from "@/hooks/usePlatformAdmin";
import { PLAN_ORDER } from "@/lib/pricingPlans";

function statusBadgeClass(status: string | null): string {
  if (!status) return "bg-muted text-muted-foreground";
  if (status === "active" || status === "trialing") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  if (status === "canceled") return "bg-destructive/15 text-destructive";
  if (status === "past_due") return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-muted text-muted-foreground";
}

const PlatformAdminPage = () => {
  const { t } = useTranslation();
  const { data: isPlatformAdmin } = usePlatformAdminAccess();
  const enabled = !!isPlatformAdmin;

  const overview = usePlatformOverview(enabled);
  const studios = usePlatformStudios(enabled);
  const events = usePlatformEvents(enabled);
  const grantSub = useGrantPlatformSubscription();
  const setStatus = useSetPlatformSubscriptionStatus();

  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<string>("all");
  const users = usePlatformUsers(enabled, userSearch, userRoleFilter === "all" ? null : userRoleFilter);

  const [grantTarget, setGrantTarget] = useState<PlatformStudio | null>(null);
  const [grantPlan, setGrantPlan] = useState("studio");
  const [grantMonths, setGrantMonths] = useState("12");
  const [grantNote, setGrantNote] = useState("");

  const refreshAll = () => {
    void overview.refetch();
    void studios.refetch();
    void users.refetch();
    void events.refetch();
  };

  const handleGrant = async () => {
    if (!grantTarget) return;
    try {
      await grantSub.mutateAsync({
        organizationId: grantTarget.id,
        planId: grantPlan,
        months: Number(grantMonths) || 12,
        note: grantNote.trim() || undefined,
      });
      toast.success(t("platformAdmin.grantSuccess", { name: grantTarget.name }));
      setGrantTarget(null);
      setGrantNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  const handleCancel = async (studio: PlatformStudio) => {
    if (!window.confirm(t("platformAdmin.cancelConfirm", { name: studio.name }))) return;
    try {
      await setStatus.mutateAsync({ organizationId: studio.id, status: "canceled" });
      toast.success(t("platformAdmin.cancelSuccess", { name: studio.name }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  const stats = useMemo(
    () => [
      { label: t("platformAdmin.stats.studios"), value: overview.data?.totalStudios ?? 0, icon: Building2 },
      { label: t("platformAdmin.stats.paying"), value: overview.data?.activeSubscriptions ?? 0, icon: Crown },
      { label: t("platformAdmin.stats.trialing"), value: overview.data?.trialing ?? 0, icon: RefreshCw },
      { label: t("platformAdmin.stats.canceled"), value: overview.data?.canceled ?? 0, icon: XCircle },
      { label: t("platformAdmin.stats.users"), value: overview.data?.totalUsers ?? 0, icon: Users },
      { label: t("platformAdmin.stats.customers"), value: overview.data?.customers ?? 0, icon: Users },
    ],
    [overview.data, t],
  );

  const isRefreshing =
    overview.isFetching || studios.isFetching || users.isFetching || events.isFetching;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <VelbokBrand className="h-7" />
            <span className="hidden text-sm text-muted-foreground sm:inline">·</span>
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Shield className="h-4 w-4 text-gold" />
              {t("platformAdmin.title")}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refreshAll} disabled={isRefreshing}>
              {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2 hidden sm:inline">{t("common.refresh")}</span>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/schedule">{t("platformAdmin.backToApp")}</Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void supabase.auth.signOut()}
            >
              <LogOut className="h-4 w-4" />
              <span className="ml-2 hidden sm:inline">{t("common.signOut")}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <div>
          <h1 className="font-display text-2xl">{t("platformAdmin.heading")}</h1>
          <p className="text-sm text-muted-foreground">{t("platformAdmin.subheading")}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-gold/10 p-2">
                  <s.icon className="h-4 w-4 text-gold" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-semibold">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="studios">
          <TabsList>
            <TabsTrigger value="studios">{t("platformAdmin.tabs.studios")}</TabsTrigger>
            <TabsTrigger value="users">{t("platformAdmin.tabs.users")}</TabsTrigger>
            <TabsTrigger value="activity">{t("platformAdmin.tabs.activity")}</TabsTrigger>
          </TabsList>

          <TabsContent value="studios" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("platformAdmin.studiosTitle")}</CardTitle>
                <CardDescription>{t("platformAdmin.studiosDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {studios.isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("platformAdmin.col.studio")}</TableHead>
                        <TableHead>{t("platformAdmin.col.owner")}</TableHead>
                        <TableHead>{t("platformAdmin.col.plan")}</TableHead>
                        <TableHead>{t("platformAdmin.col.status")}</TableHead>
                        <TableHead>{t("platformAdmin.col.periodEnd")}</TableHead>
                        <TableHead>{t("platformAdmin.col.seats")}</TableHead>
                        <TableHead className="text-right">{t("platformAdmin.col.actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(studios.data ?? []).map((studio) => (
                        <TableRow key={studio.id}>
                          <TableCell>
                            <div className="font-medium">{studio.shopName || studio.name}</div>
                            <div className="text-xs text-muted-foreground">{studio.slug}</div>
                          </TableCell>
                          <TableCell className="text-sm">{studio.ownerEmail ?? "—"}</TableCell>
                          <TableCell className="capitalize">{studio.planName || studio.planId || "—"}</TableCell>
                          <TableCell>
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(studio.subscriptionStatus)}`}>
                              {studio.subscriptionStatus || t("platformAdmin.noSub")}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">
                            {studio.currentPeriodEnd
                              ? format(new Date(studio.currentPeriodEnd), "dd MMM yyyy")
                              : studio.trialEnd
                                ? `${t("platformAdmin.trial")} ${format(new Date(studio.trialEnd), "dd MMM yyyy")}`
                                : "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {studio.artistSeats}
                            <span className="text-muted-foreground"> / {studio.memberCount}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" onClick={() => setGrantTarget(studio)}>
                                {t("platformAdmin.grantFree")}
                              </Button>
                              {studio.subscriptionStatus && studio.subscriptionStatus !== "canceled" ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive"
                                  onClick={() => void handleCancel(studio)}
                                  disabled={setStatus.isPending}
                                >
                                  {t("platformAdmin.revoke")}
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("platformAdmin.usersTitle")}</CardTitle>
                <CardDescription>{t("platformAdmin.usersDesc")}</CardDescription>
                <div className="flex flex-wrap gap-2 pt-2">
                  <div className="relative min-w-[200px] flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      placeholder={t("platformAdmin.searchUsers")}
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                    />
                  </div>
                  <Select value={userRoleFilter} onValueChange={setUserRoleFilter}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder={t("platformAdmin.filterRole")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("platformAdmin.allRoles")}</SelectItem>
                      <SelectItem value="admin">{t("nav.admin")}</SelectItem>
                      <SelectItem value="artist">Artist</SelectItem>
                      <SelectItem value="customer">Customer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {users.isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("common.name")}</TableHead>
                        <TableHead>{t("common.email")}</TableHead>
                        <TableHead>{t("platformAdmin.col.roles")}</TableHead>
                        <TableHead>{t("platformAdmin.col.studio")}</TableHead>
                        <TableHead>{t("platformAdmin.col.plan")}</TableHead>
                        <TableHead>{t("platformAdmin.col.status")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(users.data ?? []).map((u) => (
                        <TableRow key={u.userId}>
                          <TableCell className="font-medium">{u.displayName}</TableCell>
                          <TableCell className="text-sm">{u.email}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(u.roles ?? []).map((r) => (
                                <span key={r} className="rounded bg-muted px-1.5 py-0.5 text-xs capitalize">
                                  {r}
                                </span>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{u.organizationName ?? "—"}</TableCell>
                          <TableCell className="capitalize">{u.planId ?? "—"}</TableCell>
                          <TableCell>
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(u.subscriptionStatus)}`}>
                              {u.subscriptionStatus || "—"}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("platformAdmin.activityTitle")}</CardTitle>
                <CardDescription>{t("platformAdmin.activityDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {events.isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("platformAdmin.col.when")}</TableHead>
                        <TableHead>{t("platformAdmin.col.studio")}</TableHead>
                        <TableHead>{t("platformAdmin.col.event")}</TableHead>
                        <TableHead>{t("platformAdmin.col.details")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(events.data ?? []).map((ev) => (
                        <TableRow key={ev.id}>
                          <TableCell className="text-sm whitespace-nowrap">
                            {format(new Date(ev.processedAt), "dd MMM yyyy HH:mm")}
                          </TableCell>
                          <TableCell className="text-sm">{ev.organizationName ?? "—"}</TableCell>
                          <TableCell className="text-sm font-mono">{ev.eventType}</TableCell>
                          <TableCell className="max-w-md truncate text-xs text-muted-foreground font-mono">
                            {JSON.stringify(ev.payload)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={!!grantTarget} onOpenChange={(open) => !open && setGrantTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("platformAdmin.grantDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("platformAdmin.grantDialogDesc", { name: grantTarget?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("platformAdmin.grantPlan")}</Label>
              <Select value={grantPlan} onValueChange={setGrantPlan}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_ORDER.map((id) => (
                    <SelectItem key={id} value={id} className="capitalize">
                      {id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("platformAdmin.grantMonths")}</Label>
              <Select value={grantMonths} onValueChange={setGrantMonths}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="6">6</SelectItem>
                  <SelectItem value="12">12</SelectItem>
                  <SelectItem value="24">24</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("platformAdmin.grantNote")}</Label>
              <Input
                value={grantNote}
                onChange={(e) => setGrantNote(e.target.value)}
                placeholder={t("platformAdmin.grantNotePlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="gold" onClick={() => void handleGrant()} disabled={grantSub.isPending}>
              {grantSub.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("platformAdmin.grantConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PlatformAdminPage;

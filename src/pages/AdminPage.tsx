import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { STAFF_FEATURES, CUSTOMER_FEATURES } from "@/hooks/usePermissions";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, Shield, Check, X, Users, Mail, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildScheduleCSV, buildScheduleJSON, parseScheduleCSV, parseScheduleJSON, type ScheduleBookingPayload } from "@/lib/schedule-io";
import { endOfMonth, startOfMonth } from "date-fns";
import { Link } from "react-router-dom";
import { useArtistSeats } from "@/hooks/useSubscription";
import { getPlanById } from "@/lib/pricingPlans";

interface Profile {
  user_id: string;
  display_name: string;
}

interface Permission {
  user_id: string;
  feature: string;
  granted: boolean;
}

interface RoleRow {
  user_id: string;
  role: string;
}

type BookingNotificationPayload = {
  id: string;
  artist_id: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  booking_type: string;
  status: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
};

type BookingNotificationResult = {
  ok?: boolean;
  sent?: number;
  failed?: Array<{ email?: string; message?: string }>;
};

const staffFeatureLabels: Record<string, string> = {
  schedule: "Schedule",
  inbox: "Inbox",
  services: "Services",
  stencil: "Stencil",
  clients: "Clients",
  stock: "Stock",
  dashboard: "Dashboard",
  settings: "Settings",
  deposits: "Deposits",
  billing: "Billing",
  admin: "Admin",
};

const customerFeatureLabels: Record<string, string> = {
  my_bookings: "My bookings / profile",
  customer_consent: "Consent form link",
};

const AdminPage = () => {
  const { user } = useAuth();
  const { data: seatUsage, refetch: refetchSeats } = useArtistSeats();
  const [isAdmin, setIsAdmin] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolesByUser, setRolesByUser] = useState<Record<string, string[]>>({});
  const [defaults, setDefaults] = useState<{ role_template: string; feature: string; granted: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const sendBookingNotification = async (
    action: "created" | "updated" | "deleted",
    booking: BookingNotificationPayload,
  ) => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    const token = session?.access_token ?? null;
    if (sessionError || !token) {
      console.warn("Booking notification skipped: expired session");
      return;
    }

    const { data, error } = await supabase.functions.invoke<BookingNotificationResult>("booking-notifications", {
      body: { action, booking },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (error) {
      const status = (error as any)?.context?.status ?? (error as any)?.status;
      if (status === 401) {
        console.warn("Booking notification skipped: session expired (401)");
        return;
      }
      console.error("Booking notification failed:", error);
      return;
    }
    if (data?.failed && data.failed.length > 0) {
      console.warn("Booking notification partial failure:", data.failed);
    }
  };

  useEffect(() => {
    if (user) {
      checkAdmin();
      fetchData();
    }
  }, [user]);

  const checkAdmin = async () => {
    if (!user) return;
    const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    setIsAdmin(!!data);
  };

  const fetchData = async () => {
    const [profilesRes, permsRes, rolesRes, defRes] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name"),
      supabase.from("user_permissions").select("user_id, feature, granted"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("permission_role_defaults").select("role_template, feature, granted"),
    ]);
    if (profilesRes.data) setProfiles(profilesRes.data);
    if (permsRes.data) setPermissions(permsRes.data);
    if (rolesRes.data) {
      const map: Record<string, string[]> = {};
      (rolesRes.data as RoleRow[]).forEach((r) => {
        if (!map[r.user_id]) map[r.user_id] = [];
        map[r.user_id].push(r.role);
      });
      setRolesByUser(map);
    }
    if (defRes.data) setDefaults(defRes.data);
    setLoading(false);
  };

  const isPureCustomer = (userId: string) => {
    const r = rolesByUser[userId] || [];
    return r.length === 1 && r[0] === "customer";
  };

  const staffProfiles = profiles.filter((p) => !isPureCustomer(p.user_id));
  const customerProfiles = profiles.filter((p) => isPureCustomer(p.user_id));

  const hasFeature = (userId: string, feature: string) =>
    permissions.some((p) => p.user_id === userId && p.feature === feature && p.granted);

  const togglePermission = async (userId: string, feature: string) => {
    const current = hasFeature(userId, feature);
    const { error } = await supabase
      .from("user_permissions")
      .upsert({ user_id: userId, feature, granted: !current }, { onConflict: "user_id,feature" });
    if (error) {
      toast.error("Failed to update permission");
      return;
    }
    toast.success(`${!current ? "Granted" : "Revoked"} ${feature}`);
    fetchData();
  };

  const toggleAllStaff = async (userId: string, grant: boolean) => {
    const upserts = STAFF_FEATURES.map((f) => ({ user_id: userId, feature: f, granted: grant }));
    const { error } = await supabase.from("user_permissions").upsert(upserts, { onConflict: "user_id,feature" });
    if (error) {
      toast.error("Failed to update permissions");
      return;
    }
    toast.success(grant ? "Granted all staff features" : "Revoked all staff features");
    fetchData();
  };

  const toggleDefault = async (roleTemplate: "customer" | "artist", feature: string, granted: boolean) => {
    const { error } = await supabase
      .from("permission_role_defaults")
      .upsert({ role_template: roleTemplate, feature, granted }, { onConflict: "role_template,feature" });
    if (error) {
      toast.error("Failed to save default");
      return;
    }
    setDefaults((d) => {
      const next = d.filter((x) => !(x.role_template === roleTemplate && x.feature === feature));
      return [...next, { role_template: roleTemplate, feature, granted }];
    });
    toast.success("Default updated — applies to new invites only");
  };

  const defaultGranted = (roleTemplate: string, feature: string) =>
    defaults.some((d) => d.role_template === roleTemplate && d.feature === feature && d.granted);

  const sendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter a valid email");
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
        toast.error(error.message || "Invite failed");
        return;
      }
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      toast.success(`Artist invite sent to ${email}`);
      setInviteEmail("");
      void refetchSeats();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invite failed");
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
    toast.success(`Exported ${rows.length} booking(s)`);
  };

  const importSchedule = async (file: File) => {
    const text = await file.text();
    let rows: ScheduleBookingPayload[] = [];
    try {
      rows = file.name.endsWith(".csv") ? parseScheduleCSV(text) : parseScheduleJSON(text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid file");
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
    }));
    const { data: insertedBookings, error } = await supabase
      .from("bookings")
      .insert(batch)
      .select("id, artist_id, client_name, client_email, client_phone, booking_type, status, starts_at, ends_at, notes");
    if (error) return toast.error(error.message);
    if (insertedBookings?.length) {
      await Promise.allSettled(insertedBookings.map((b) => sendBookingNotification("created", b as BookingNotificationPayload)));
    }
    toast.success(`Imported ${batch.length} booking(s)`);
  };

  const resetSchedule = async () => {
    if (!window.confirm("Delete ALL bookings from schedule?")) return;
    const { data: snapshots } = await supabase
      .from("bookings")
      .select("id, artist_id, client_name, client_email, client_phone, booking_type, status, starts_at, ends_at, notes");
    // Avoid UUID comparisons here; use a guaranteed non-null timestamp column.
    const { error } = await supabase.from("bookings").delete().not("created_at", "is", null);
    if (error) return toast.error(error.message);
    if (snapshots?.length) {
      await Promise.allSettled(snapshots.map((b) => sendBookingNotification("deleted", b as BookingNotificationPayload)));
    }
    toast.success("Schedule reset");
  };
  if (!isAdmin && !loading) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">Admin access required</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto overflow-x-hidden pb-24">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" /> Admin
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Default roles and per-user access</p>
        </div>

        <Card className="border-teal-900/30 bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-teal-500" />
              <CardTitle className="text-base">Send magic link (new account)</CardTitle>
            </div>
            <CardDescription>
              Invite artists/staff accounts. Customer invites are now managed from Schedule.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md">
            {seatUsage && seatUsage.max != null ? (
              <div className="rounded-lg border border-border/70 bg-secondary/70 px-3 py-2 text-sm">
                <p className="font-medium">
                  Artist seats: {seatUsage.used} / {seatUsage.max}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {getPlanById(seatUsage.planId ?? "")?.name ?? "Current"} plan
                  {!seatUsage.canAdd ? " — limit reached" : ""}
                </p>
                {!seatUsage.canAdd ? (
                  <Button variant="link" className="h-auto p-0 mt-2 text-[#d4af37]" asChild>
                    <Link
                      to={
                        seatUsage.planId === "starter"
                          ? "/subscribe?plan=studio"
                          : seatUsage.planId === "studio"
                            ? "/subscribe?plan=enterprise"
                            : "/contact"
                      }
                    >
                      Upgrade for more seats
                    </Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
            <div>
              <Label htmlFor="inv-email">Email</Label>
              <Input
                id="inv-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="newuser@example.com"
                className="mt-1 bg-secondary"
              />
            </div>
            <Button onClick={sendInvite} disabled={inviting || seatUsage?.canAdd === false} className="gap-2">
              <UserPlus className="h-4 w-4" />
              {inviting ? "Sending…" : seatUsage?.canAdd === false ? "Seat limit reached" : "Send artist invite"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Schedule admin tools</CardTitle>
            <CardDescription>Import, export, or reset schedule data</CardDescription>
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
              <Button variant="outline" onClick={() => exportSchedule("json")}>Export JSON</Button>
              <Button variant="outline" onClick={() => exportSchedule("csv")}>Export CSV</Button>
              <Button variant="outline" onClick={() => importInputRef.current?.click()}>Import</Button>
              <Button variant="destructive" onClick={resetSchedule}>Reset schedule</Button>
            </div>
          </CardContent>
        </Card>
        <Tabs defaultValue="defaults" className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="defaults">New-user defaults</TabsTrigger>
            <TabsTrigger value="staff">Staff matrix</TabsTrigger>
            <TabsTrigger value="customers">Customers</TabsTrigger>
            <TabsTrigger value="consents">Consents</TabsTrigger>
          </TabsList>

          <TabsContent value="defaults" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Defaults apply when someone accepts an invite as <strong>Customer</strong> or <strong>Artist</strong>. Existing users are unchanged.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="h-4 w-4" /> Customer defaults
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {CUSTOMER_FEATURES.map((f) => (
                    <div key={f} className="flex items-center justify-between gap-2 py-1">
                      <span className="text-sm">{customerFeatureLabels[f]}</span>
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
                    <Shield className="h-4 w-4" /> Artist defaults
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 max-h-[320px] overflow-y-auto">
                  {STAFF_FEATURES.map((f) => (
                    <div key={f} className="flex items-center justify-between gap-2 py-0.5">
                      <span className="text-xs">{staffFeatureLabels[f]}</span>
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
                      <span className="text-xs text-muted-foreground">{customerFeatureLabels[f]} (nav)</span>
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
                <CardTitle className="text-base">Staff feature access</CardTitle>
                <CardDescription>Artists and admins — not customer-only accounts</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-card z-10 min-w-[120px]">User</TableHead>
                      {STAFF_FEATURES.map((f) => (
                        <TableHead key={f} className="text-center text-[10px] px-1 min-w-[56px]">
                          {staffFeatureLabels[f]}
                        </TableHead>
                      ))}
                      <TableHead className="text-center text-[10px] px-2">All</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staffProfiles.map((profile) => {
                      const allGranted = STAFF_FEATURES.every((f) => hasFeature(profile.user_id, f));
                      return (
                        <TableRow key={profile.user_id}>
                          <TableCell className="sticky left-0 bg-card z-10 font-medium text-sm">{profile.display_name}</TableCell>
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
                              {allGranted ? "Revoke" : "Grant all"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="customers" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Customer accounts</CardTitle>
                <CardDescription>Portal access: bookings/profile and consent link</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {customerProfiles.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground text-center">No customer-only accounts yet. Invite with “Customer”.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-center">My bookings</TableHead>
                        <TableHead className="text-center">Consent</TableHead>
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

          <TabsContent value="consents" className="mt-4">
            <AdminConsentsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default AdminPage;

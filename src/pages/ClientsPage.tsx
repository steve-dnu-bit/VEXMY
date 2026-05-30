import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, Download, Upload, Trash2, FileJson, FileSpreadsheet, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import AppLayout from "@/components/AppLayout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";

interface BookingClient {
  /** Stable key for React lists and dedupe (never collapse different people on same first name). */
  listKey: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  tattoo_style: string | null;
  booking_count: number;
  last_visit: string | null;
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

/** Parse CSV including quoted commas and newlines; strips UTF-8 BOM. */
function parseCsvRecords(raw: string): string[][] {
  const text = raw.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field.trim());
    field = "";
  };
  const pushRow = () => {
    if (row.length > 0 && row.some((c) => c.length > 0)) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        pushField();
      } else if (ch === "\r" && text[i + 1] === "\n") {
        pushField();
        pushRow();
        i++;
      } else if (ch === "\n" || ch === "\r") {
        pushField();
        pushRow();
      } else {
        field += ch;
      }
    }
  }
  pushField();
  pushRow();
  return rows;
}

function sessionBookingGroupKey(b: {
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
}): string {
  const email = (b.client_email || "").trim().toLowerCase();
  const phone = (b.client_phone || "").replace(/\s/g, "");
  if (email) return `session:email:${email}`;
  if (phone) return `session:phone:${phone}`;
  return `session:name:${b.client_name.trim().toLowerCase()}`;
}

function importedContactGroupKey(c: { name: string; email: string | null; phone: string | null }): string {
  const email = (c.email || "").trim().toLowerCase();
  const phone = (c.phone || "").replace(/\s/g, "");
  if (email) return `session:email:${email}`;
  if (phone) return `session:phone:${phone}`;
  return `session:name:${c.name.trim().toLowerCase()}`;
}

const ClientsPage = () => {
  const { t } = useTranslation();
  const [clients, setClients] = useState<BookingClient[]>([]);
  const [search, setSearch] = useState("");
  const csvInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

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
    fetchClients();
  }, []);

  const fetchClients = async () => {
    const pageSize = 1000;
    let from = 0;
    const bookingRows: Array<{
      id: string;
      booking_type: string;
      client_name: string;
      client_email: string | null;
      client_phone: string | null;
      tattoo_style: string | null;
      starts_at: string;
    }> = [];

    for (;;) {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, booking_type, client_name, client_email, client_phone, tattoo_style, starts_at")
        .order("starts_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) break;
      if (!data?.length) break;
      bookingRows.push(...(data as typeof bookingRows));
      if (data.length < pageSize) break;
      from += pageSize;
    }

    const grouped: Record<string, BookingClient> = {};

    for (const b of bookingRows) {
      if (b.booking_type === "consultation") {
        const key = `consultation:${b.id}`;
        grouped[key] = {
          listKey: key,
          client_name: b.client_name,
          client_email: b.client_email,
          client_phone: b.client_phone,
          tattoo_style: b.tattoo_style,
          booking_count: 1,
          last_visit: b.starts_at,
        };
        continue;
      }

      const key = sessionBookingGroupKey(b);
      if (!grouped[key]) {
        grouped[key] = {
          listKey: key,
          client_name: b.client_name,
          client_email: b.client_email,
          client_phone: b.client_phone,
          tattoo_style: b.tattoo_style,
          booking_count: 0,
          last_visit: b.starts_at,
        };
      }
      grouped[key].booking_count++;
      if (new Date(b.starts_at) > new Date(grouped[key].last_visit || 0)) {
        grouped[key].last_visit = b.starts_at;
        if (b.tattoo_style) grouped[key].tattoo_style = b.tattoo_style;
      }
    }

    // Also include signed-up customer accounts even if they have no bookings yet.
    const { data: customerRoles } = await supabase.from("user_roles").select("user_id").eq("role", "customer");
    const customerIds = (customerRoles ?? []).map((r) => r.user_id).filter(Boolean);

    if (customerIds.length > 0) {
      const { data: customerProfiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, phone")
        .in("user_id", customerIds);

      for (const p of customerProfiles ?? []) {
        const name = (p.display_name || "").trim();
        if (!name) continue;
        const key = `profile:${p.user_id}`;
        if (!grouped[key]) {
          grouped[key] = {
            listKey: key,
            client_name: name,
            client_email: null,
            client_phone: p.phone ?? null,
            tattoo_style: null,
            booking_count: 0,
            last_visit: null,
          };
        } else {
          if (!grouped[key].client_phone && p.phone) grouped[key].client_phone = p.phone;
        }
      }
    }

    // Include imported contacts table records in the client list so bulk imports are visible on this page.
    // Fetch in pages because project API row limits often cap single requests (e.g. 1000 rows).
    const importedContacts: Array<{ name?: string | null; email?: string | null; phone?: string | null }> = [];
    {
      const pageSize = 1000;
      let from = 0;
      for (;;) {
        const { data, error } = await supabase
          .from("contacts_import" as any)
          .select("name, email, phone")
          .range(from, from + pageSize - 1);
        if (error || !data?.length) break;
        importedContacts.push(...(data as Array<{ name?: string | null; email?: string | null; phone?: string | null }>));
        if (data.length < pageSize) break;
        from += pageSize;
      }
    }

    for (const row of importedContacts) {
      const name = (row?.name || "").trim();
      if (!name) continue;
      const email = row?.email ? row.email.trim().toLowerCase() : null;
      const phone = row?.phone ? row.phone.trim() : null;
      const key = importedContactGroupKey({ name, email, phone });
      if (!grouped[key]) {
        grouped[key] = {
          listKey: key,
          client_name: name,
          client_email: email,
          client_phone: phone,
          tattoo_style: null,
          booking_count: 0,
          last_visit: null,
        };
      } else {
        if (!grouped[key].client_email && email) grouped[key].client_email = email;
        if (!grouped[key].client_phone && phone) grouped[key].client_phone = phone;
      }
    }

    setClients(Object.values(grouped));
  };

  const deleteAllClients = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: snapshots } = await supabase
      .from("bookings")
      .select("id, artist_id, client_name, client_email, client_phone, booking_type, status, starts_at, ends_at, notes")
      .eq("booking_type", "consultation");
    const { error } = await supabase.from("bookings").delete().eq("booking_type", "consultation");
    if (error) {
      toast({ title: t("clients.failedDeleteClients"), description: error.message, variant: "destructive" });
    } else {
      if (snapshots?.length) {
        await Promise.allSettled(snapshots.map((b) => sendBookingNotification("deleted", b as BookingNotificationPayload)));
      }
      toast({ title: t("clients.importedDeleted") });
      fetchClients();
    }
  };

  const downloadBlob = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    if (clients.length === 0) {
      toast({ title: t("clients.noClientsToExport"), variant: "destructive" });
      return;
    }
    const headers = [
      t("clients.csvHeadersName"),
      t("clients.csvHeadersEmail"),
      t("clients.csvHeadersPhone"),
      t("clients.csvHeadersBookings"),
      t("clients.csvHeadersStyle"),
    ];
    const rows = clients.map((c) => [
      c.client_name,
      c.client_email || "",
      c.client_phone || "",
      String(c.booking_count),
      c.tattoo_style || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadBlob(csv, `clients-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv");
    toast({ title: t("clients.exportedCsv", { count: clients.length }) });
  };

  const exportJSON = () => {
    if (clients.length === 0) {
      toast({ title: t("clients.noClientsToExport"), variant: "destructive" });
      return;
    }
    const payload = {
      app: "vexmy",
      version: 1,
      exportedAt: new Date().toISOString(),
      clients: clients.map((c) => ({
        name: c.client_name,
        email: c.client_email,
        phone: c.client_phone,
        bookings: c.booking_count,
        last_style: c.tattoo_style,
      })),
    };
    downloadBlob(JSON.stringify(payload, null, 2), `clients-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
    toast({ title: t("clients.exportedJson", { count: clients.length }) });
  };

  const importCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const allRows = parseCsvRecords(text);
      if (allRows.length < 2) {
        toast({ title: t("clients.csvInvalid"), variant: "destructive" });
        return;
      }

      const headers = allRows[0].map((h) => h.toLowerCase().trim().replace(/^\uFEFF/, ""));
      const nameIndex = headers.findIndex((h) => h === "name" || h === "client_name" || h.includes("full name"));
      const emailIndex = headers.findIndex((h) => h === "email" || h === "client_email");
      const emailAltIndex = headers.findIndex((h) => h === "email1" || h === "email 1");
      const phoneIndex = headers.findIndex((h) => h === "phone" || h === "client_phone");
      const phoneAltIndex = headers.findIndex((h) => h === "phone1" || h === "phone 1");
      const styleIndex = headers.findIndex((h) => h.includes("style") || h.includes("tattoo_style"));

      if (nameIndex < 0) {
        toast({ title: t("clients.csvMissingName"), variant: "destructive" });
        return;
      }

      const dataRows = allRows.slice(1);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: t("clients.mustBeLoggedInImport"), variant: "destructive" });
        return;
      }

      const baseMs = Date.now();
      const toInsert: Array<{
        client_name: string;
        client_email: string | null;
        client_phone: string | null;
        tattoo_style: string | null;
        notes: string | null;
        artist_id: string;
        starts_at: string;
        ends_at: string;
        booking_type: string;
        status: string;
        deposit_paid: boolean;
      }> = [];

      for (let r = 0; r < dataRows.length; r++) {
        const cols = dataRows[r];
        if (!cols || cols.length <= nameIndex) continue;
        const name = (cols[nameIndex] || "").trim();
        if (!name) continue;
        const email = (cols[emailIndex] || cols[emailAltIndex] || "").trim().toLowerCase();
        const phone = (cols[phoneIndex] || cols[phoneAltIndex] || "").trim();
        const style = styleIndex >= 0 ? (cols[styleIndex] || "").trim() : "";
        const start = new Date(baseMs + r * 1000).toISOString();
        const end = new Date(baseMs + r * 1000 + 3600000).toISOString();

        toInsert.push({
          client_name: name,
          client_email: email || null,
          client_phone: phone || null,
          tattoo_style: style || null,
          notes: "Imported from CSV (contacts export)",
          artist_id: user.id,
          starts_at: start,
          ends_at: end,
          booking_type: "consultation",
          status: "confirmed",
          deposit_paid: true,
        });
      }

      if (toInsert.length === 0) {
        toast({ title: t("clients.noValidRows"), variant: "destructive" });
        return;
      }

      let imported = 0;
      const errors: string[] = [];
      const chunkSize = 150;
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        const { data: inserted, error } = await supabase
          .from("bookings")
          .insert(chunk)
          .select("id, artist_id, client_name, client_email, client_phone, booking_type, status, starts_at, ends_at, notes");
        if (error) {
          errors.push(`rows ${i + 1}-${i + chunk.length}: ${error.message}`);
        } else {
          imported += chunk.length;
          if (inserted?.length) {
            await Promise.allSettled(inserted.map((b) => sendBookingNotification("created", b as BookingNotificationPayload)));
          }
        }
      }

      if (errors.length) {
        toast({
          title: t("clients.importedPartial", { imported, total: toInsert.length }),
          description: errors.slice(0, 2).join(" · "),
          variant: imported ? "default" : "destructive",
        });
      } else {
        toast({ title: t("clients.importedFromCsv", { count: imported }) });
      }
      fetchClients();
    };
    reader.readAsText(file);
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  const importJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string) as { clients?: Array<Record<string, unknown>> };
        const list = Array.isArray(raw.clients) ? raw.clients : Array.isArray(raw) ? (raw as unknown[]) : [];
        if (list.length === 0) {
          toast({ title: t("clients.noClientsArray"), variant: "destructive" });
          return;
        }
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          toast({ title: t("clients.mustBeLoggedInImport"), variant: "destructive" });
          return;
        }
        let imported = 0;
        const now = new Date().toISOString();
        for (const row of list) {
          const r = row as Record<string, unknown>;
          const name = String(r.name || r.client_name || "").trim();
          if (!name) continue;
          const { data: inserted, error } = await supabase
            .from("bookings")
            .insert({
            client_name: name,
            client_email: (r.email as string) || (r.client_email as string) || null,
            client_phone: (r.phone as string) || (r.client_phone as string) || null,
            tattoo_style: (r.last_style as string) || (r.tattoo_style as string) || null,
            artist_id: user.id,
            starts_at: now,
            ends_at: new Date(Date.now() + 3600000).toISOString(),
            booking_type: "consultation",
            status: "confirmed",
            deposit_paid: true,
            })
            .select("id, artist_id, client_name, client_email, client_phone, booking_type, status, starts_at, ends_at, notes")
            .single();
          if (!error && inserted) {
            imported++;
            await sendBookingNotification("created", inserted as BookingNotificationPayload);
          }
        }
        toast({ title: t("clients.importedFromJson", { count: imported }) });
        fetchClients();
      } catch {
        toast({ title: t("clients.invalidJsonFile"), variant: "destructive" });
      }
    };
    reader.readAsText(file);
    if (jsonInputRef.current) jsonInputRef.current.value = "";
  };

  const q = search.trim().toLowerCase();
  const filtered = clients.filter((c) => {
    if (!q) return true;
    return (
      c.client_name.toLowerCase().includes(q) ||
      (c.client_email && c.client_email.toLowerCase().includes(q)) ||
      (c.client_phone && c.client_phone.replace(/\s/g, "").includes(q.replace(/\s/g, "")))
    );
  });

  return (
    <AppLayout>
      <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-5xl mx-auto">
        <div className="flex flex-col gap-3 mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold">
              <span className="text-gradient-gold">{t("clients.title")}</span>
            </h1>
            <p className="text-sm text-muted-foreground">{t("clients.subtitle")}</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("clients.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-secondary border-border min-h-11"
              />
            </div>
            <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={importCSV} />
            <input ref={jsonInputRef} type="file" accept=".json,application/json" className="hidden" onChange={importJSON} />

            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="flex-1 sm:flex-none min-h-11 sm:min-h-9 gap-1">
                    <Upload className="h-4 w-4 shrink-0" />
                    {t("clients.import")}
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel className="text-xs">{t("clients.importClients")}</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => csvInputRef.current?.click()}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    {t("clients.csvFile")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => jsonInputRef.current?.click()}>
                    <FileJson className="h-4 w-4 mr-2" />
                    {t("clients.jsonFile")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="flex-1 sm:flex-none min-h-11 sm:min-h-9 gap-1">
                    <Download className="h-4 w-4 shrink-0" />
                    {t("clients.export")}
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel className="text-xs">{t("clients.exportClients")}</DropdownMenuLabel>
                  <DropdownMenuItem onClick={exportCSV}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    {t("clients.downloadCsv")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportJSON}>
                    <FileJson className="h-4 w-4 mr-2" />
                    {t("clients.downloadJson")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="min-h-11 sm:min-h-9" disabled={clients.length === 0}>
                    <Trash2 className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">{t("clients.resetImports")}</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("clients.deleteImportedTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("clients.deleteImportedDesc")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={deleteAllClients}>{t("clients.deleteAll")}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>

        <div className="hidden md:block rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-secondary/70">
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-widest text-muted-foreground font-medium">{t("clients.tableName")}</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-widest text-muted-foreground font-medium">{t("clients.tableEmail")}</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-widest text-muted-foreground font-medium">{t("clients.tablePhone")}</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-widest text-muted-foreground font-medium">{t("clients.tableBookings")}</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-widest text-muted-foreground font-medium">{t("clients.tableStyle")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                      {clients.length === 0 ? t("clients.noClientsYet") : t("clients.noMatches")}
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => (
                    <tr key={c.listKey} className="border-b border-border hover:bg-secondary/40 transition-colors">
                      <td className="px-4 py-3 font-medium">{c.client_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.client_email || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.client_phone || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{c.booking_count}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{c.tattoo_style || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="md:hidden space-y-2">
          {filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">
              {clients.length === 0 ? t("clients.noClientsMobile") : t("clients.noMatches")}
            </p>
          ) : (
            filtered.map((c) => (
              <div key={c.listKey} className="rounded-xl border border-border bg-card p-4 space-y-1 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{c.client_name}</p>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary shrink-0">
                    {c.booking_count} {t("clients.appointmentsShort")}{c.booking_count !== 1 ? t("clients.appointmentsPlural") : ""}
                  </span>
                </div>
                {c.client_email && <p className="text-sm text-muted-foreground break-all">{c.client_email}</p>}
                {c.client_phone && <p className="text-sm text-muted-foreground">{c.client_phone}</p>}
                {c.tattoo_style && <p className="text-xs text-muted-foreground">{t("clients.stylePrefix", { style: c.tattoo_style })}</p>}
              </div>
            ))
          )}
        </div>

        {/* Mobile sticky action bar */}
        <div className="fixed bottom-0 left-0 right-0 z-40 flex gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-background/95 backdrop-blur border-t border-border md:hidden">
          <Button variant="outline" className="flex-1 gap-1" size="sm" onClick={() => csvInputRef.current?.click()}>
            <Upload className="h-4 w-4" /> {t("clients.mobileCsv")}
          </Button>
          <Button variant="outline" className="flex-1 gap-1" size="sm" onClick={() => jsonInputRef.current?.click()}>
            <Upload className="h-4 w-4" /> {t("clients.mobileJson")}
          </Button>
          <Button variant="default" className="flex-1 gap-1" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4" /> {t("clients.mobileCsv")}
          </Button>
          <Button variant="default" className="flex-1 gap-1" size="sm" onClick={exportJSON}>
            <Download className="h-4 w-4" /> {t("clients.mobileJson")}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
};

export default ClientsPage;

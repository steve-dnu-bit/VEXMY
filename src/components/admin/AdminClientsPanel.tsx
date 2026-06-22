import { useEffect, useState, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Search, Download, Upload, Trash2, FileJson, FileSpreadsheet, ChevronDown, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
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
import { useArtistDataPrivacy } from "@/hooks/useArtistDataPrivacy";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { loadOrganizationCustomerIds, loadOrganizationMemberIds } from "@/lib/organizationMembers";
import { getUserOrganizationId } from "@/lib/shopSettings";
import { Link } from "react-router-dom";
import ExternalMessageActions from "@/components/messaging/ExternalMessageActions";
import { extractClientUserIdFromListKey } from "@/lib/messagingLinks";
import { parseCsvRecords } from "@/lib/csvRecords";

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

/** Maximum client rows per CSV/JSON import. */
const MAX_CLIENT_IMPORT_ROWS = 5000;
const CLIENT_IMPORT_CHUNK_SIZE = 150;

type ContactImportInsert = {
  organization_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  tattoo_style: string | null;
  notes: string | null;
  created_by: string;
};

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

const AdminClientsPanel = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { restricted: artistPrivacyRestricted } = useArtistDataPrivacy();
  const { hasFeature } = useSubscription();
  const hasStaffInbox = hasFeature("staff_inbox");
  const [clients, setClients] = useState<BookingClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const csvInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    setLoading(true);
    setLoadError(null);
    const pageSize = 1000;
    let from = 0;
    const bookingRows: Array<{
      id: string;
      booking_type: string;
      client_name: string;
      client_email: string | null;
      client_phone: string | null;
      client_user_id: string | null;
      tattoo_style: string | null;
      starts_at: string;
    }> = [];

    for (;;) {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, booking_type, client_name, client_email, client_phone, client_user_id, tattoo_style, starts_at")
        .order("starts_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) {
        setLoadError(error.message);
        setClients([]);
        setLoading(false);
        return;
      }
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

    // Signed-up customer accounts (shop admins see all; privacy-restricted artists only linked clients).
    const orgMemberIds = await loadOrganizationMemberIds();
    let customerIds: string[];
    if (artistPrivacyRestricted && user?.id) {
      customerIds = [
        ...new Set(
          bookingRows.map((b) => b.client_user_id).filter((id): id is string => Boolean(id)),
        ),
      ];
    } else if (orgMemberIds) {
      customerIds = [...(await loadOrganizationCustomerIds())];
    } else {
      const { data: customerRoles } = await supabase.from("user_roles").select("user_id").eq("role", "customer");
      customerIds = (customerRoles ?? []).map((r) => r.user_id).filter(Boolean);
    }

    if (customerIds.length > 0) {
      const customerProfiles: Array<{ user_id: string; display_name: string | null; phone: string | null }> = [];
      const profileChunkSize = 100;
      for (let i = 0; i < customerIds.length; i += profileChunkSize) {
        const chunk = customerIds.slice(i, i + profileChunkSize);
        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, display_name, phone")
          .in("user_id", chunk);
        if (error) {
          console.warn("Could not load customer profiles:", error.message);
          break;
        }
        customerProfiles.push(...(data ?? []));
      }

      for (const p of customerProfiles) {
        const name = (p.display_name || "").trim() || t("clients.customerFallback");
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
    const orgId = await getUserOrganizationId();
    const importedContacts: Array<{ name?: string | null; email?: string | null; phone?: string | null }> = [];
    if (orgId) {
      const pageSize = 1000;
      let from = 0;
      for (;;) {
        const { data, error } = await supabase
          .from("contacts_import" as any)
          .select("name, email, phone")
          .eq("organization_id", orgId)
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

    setClients(
      Object.values(grouped).sort((a, b) => a.client_name.localeCompare(b.client_name, undefined, { sensitivity: "base" })),
    );
    setLoading(false);
  };

  const deleteAllClients = async () => {
    const orgId = await getUserOrganizationId();
    if (!orgId) {
      toast({ title: t("clients.failedDeleteClients"), description: t("common.organizationNotFound"), variant: "destructive" });
      return;
    }

    const { error: contactsError } = await supabase.from("contacts_import" as any).delete().eq("organization_id", orgId);
    if (contactsError) {
      toast({ title: t("clients.failedDeleteClients"), description: contactsError.message, variant: "destructive" });
      return;
    }

    // Legacy cleanup: placeholder consultation rows from older imports.
    const { error: legacyError } = await supabase
      .from("bookings")
      .delete()
      .eq("booking_type", "consultation")
      .or("notes.ilike.Imported from CSV%,notes.ilike.Imported from JSON%");
    if (legacyError) {
      toast({ title: t("clients.failedDeleteClients"), description: legacyError.message, variant: "destructive" });
      return;
    }

    toast({ title: t("clients.importedDeleted") });
    fetchClients();
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
      app: "velbok",
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

  const insertImportedClients = async (toInsert: ContactImportInsert[], source: "csv" | "json") => {
    if (toInsert.length > MAX_CLIENT_IMPORT_ROWS) {
      toast({
        title: t("clients.importLimitExceeded", { max: MAX_CLIENT_IMPORT_ROWS, count: toInsert.length }),
        variant: "destructive",
      });
      return;
    }

    let imported = 0;
    const errors: string[] = [];
    for (let i = 0; i < toInsert.length; i += CLIENT_IMPORT_CHUNK_SIZE) {
      const chunk = toInsert.slice(i, i + CLIENT_IMPORT_CHUNK_SIZE);
      const { error } = await supabase.from("contacts_import" as any).insert(chunk);
      if (error) {
        errors.push(`rows ${i + 1}-${i + chunk.length}: ${error.message}`);
      } else {
        imported += chunk.length;
      }
    }

    if (errors.length) {
      toast({
        title: t("clients.importedPartial", { imported, total: toInsert.length }),
        description: errors.slice(0, 2).join(" · "),
        variant: imported ? "default" : "destructive",
      });
    } else {
      toast({
        title: source === "csv" ? t("clients.importedFromCsv", { count: imported }) : t("clients.importedFromJson", { count: imported }),
        description: t("clients.importNoEmailsHint"),
      });
    }
    fetchClients();
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
      const orgId = await getUserOrganizationId();
      if (!orgId) {
        toast({ title: t("clients.mustBeLoggedInImport"), description: t("common.organizationNotFound"), variant: "destructive" });
        return;
      }

      const toInsert: ContactImportInsert[] = [];

      for (let r = 0; r < dataRows.length; r++) {
        const cols = dataRows[r];
        if (!cols || cols.length <= nameIndex) continue;
        const name = (cols[nameIndex] || "").trim();
        if (!name) continue;
        const emailRaw = (cols[emailIndex] || cols[emailAltIndex] || "").trim().toLowerCase();
        const email = emailRaw.replace(/^mailto:/, "") || null;
        const phone = (cols[phoneIndex] || cols[phoneAltIndex] || "").trim();
        const style = styleIndex >= 0 ? (cols[styleIndex] || "").trim() : "";

        toInsert.push({
          organization_id: orgId,
          name,
          email: email || null,
          phone: phone || null,
          tattoo_style: style || null,
          notes: "Imported from CSV (contacts export)",
          created_by: user.id,
        });
      }

      if (toInsert.length === 0) {
        toast({ title: t("clients.noValidRows"), variant: "destructive" });
        return;
      }

      await insertImportedClients(toInsert, "csv");
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

        const orgId = await getUserOrganizationId();
        if (!orgId) {
          toast({ title: t("clients.mustBeLoggedInImport"), description: t("common.organizationNotFound"), variant: "destructive" });
          return;
        }

        const toInsert: ContactImportInsert[] = [];
        for (let r = 0; r < list.length; r++) {
          const row = list[r] as Record<string, unknown>;
          const name = String(row.name || row.client_name || "").trim();
          if (!name) continue;
          toInsert.push({
            organization_id: orgId,
            name,
            email: (String(row.email || row.client_email || "").trim().toLowerCase().replace(/^mailto:/, "") || null),
            phone: ((row.phone as string) || (row.client_phone as string) || "").trim() || null,
            tattoo_style: ((row.last_style as string) || (row.tattoo_style as string) || "").trim() || null,
            notes: "Imported from JSON (contacts export)",
            created_by: user.id,
          });
        }

        if (toInsert.length === 0) {
          toast({ title: t("clients.noValidRows"), variant: "destructive" });
          return;
        }

        await insertImportedClients(toInsert, "json");
      } catch {
        toast({ title: t("clients.invalidJsonFile"), variant: "destructive" });
      }
    };
    reader.readAsText(file);
    if (jsonInputRef.current) jsonInputRef.current.value = "";
  };

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const list = q
      ? clients.filter(
          (c) =>
            c.client_name.toLowerCase().includes(q) ||
            (c.client_email && c.client_email.toLowerCase().includes(q)) ||
            (c.client_phone && c.client_phone.replace(/\s/g, "").includes(q.replace(/\s/g, ""))),
        )
      : clients;
    return list;
  }, [clients, q]);

  return (
      <div className="pb-20 md:pb-0">
        <div className="flex flex-col gap-3 mb-6">
          <div>
            <p className="text-sm text-muted-foreground">{t("clients.subtitle")}</p>
            {!loading && !loadError && clients.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1" aria-live="polite">
                {q
                  ? t("clients.searchResults", { count: filtered.length, total: clients.length })
                  : t("clients.totalClients", { count: clients.length })}
              </p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("clients.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 field-surface border-border min-h-11"
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

        {loadError ? (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive text-center">
            {loadError}
          </p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground py-12 text-center">{t("common.loading")}</p>
        ) : (
        <>
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
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-widest text-muted-foreground font-medium">{t("clients.tableContact")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                      {clients.length === 0 ? t("clients.noClientsYet") : t("clients.noMatches")}
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => {
                    const clientUserId = extractClientUserIdFromListKey(c.listKey);
                    return (
                    <tr key={c.listKey} className="border-b border-border hover:bg-secondary/40 transition-colors">
                      <td className="px-4 py-3 font-medium">{c.client_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.client_email || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.client_phone || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{c.booking_count}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{c.tattoo_style || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <ExternalMessageActions
                            phone={c.client_phone}
                            email={c.client_email}
                            whatsAppMessage={t("clients.whatsAppPrefill", { name: c.client_name })}
                            emailSubject={t("unifiedInbox.templateGeneralSubject", { name: c.client_name })}
                            emailBody={t("clients.whatsAppPrefill", { name: c.client_name })}
                          />
                          {clientUserId && hasStaffInbox ? (
                            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" asChild>
                              <Link to={`/inbox?customerId=${encodeURIComponent(clientUserId)}`}>
                                <MessageSquare className="h-3.5 w-3.5" />
                                {t("tickets.viewTickets")}
                              </Link>
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    );
                  })
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
            filtered.map((c) => {
              const clientUserId = extractClientUserIdFromListKey(c.listKey);
              return (
              <div key={c.listKey} className="rounded-xl border border-border bg-card p-4 space-y-2 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{c.client_name}</p>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary shrink-0">
                    {c.booking_count} {t("clients.appointmentsShort")}{c.booking_count !== 1 ? t("clients.appointmentsPlural") : ""}
                  </span>
                </div>
                {c.client_email && <p className="text-sm text-muted-foreground break-all">{c.client_email}</p>}
                {c.client_phone && <p className="text-sm text-muted-foreground">{c.client_phone}</p>}
                {c.tattoo_style && <p className="text-xs text-muted-foreground">{t("clients.stylePrefix", { style: c.tattoo_style })}</p>}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <ExternalMessageActions
                    phone={c.client_phone}
                    email={c.client_email}
                    whatsAppMessage={t("clients.whatsAppPrefill", { name: c.client_name })}
                    emailSubject={t("unifiedInbox.templateGeneralSubject", { name: c.client_name })}
                    emailBody={t("clients.whatsAppPrefill", { name: c.client_name })}
                  />
                  {clientUserId && hasStaffInbox ? (
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1" asChild>
                      <Link to={`/inbox?customerId=${encodeURIComponent(clientUserId)}`}>
                        <MessageSquare className="h-3.5 w-3.5" />
                        {t("tickets.viewTickets")}
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
              );
            })
          )}
        </div>
        </>
        )}

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
  );
};

export default AdminClientsPanel;

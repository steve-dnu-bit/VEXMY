import { useCallback, useEffect, useMemo, useState } from "react";
import { safeFormatDate } from "@/lib/safeDateFormat";
import { Download, Eye, FileSignature, Loader2, Printer, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { consentPdfBasename, downloadConsentPdf, printConsentPdf } from "@/lib/consentPdfActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type ConsentRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  consent_pdf_url: string | null;
  bookingStartsAt: string | null;
  bookingType: "tattoo" | "piercing" | null;
  artistName: string | null;
};

function consentTypeFromBooking(booking?: {
  service_category?: string | null;
  booking_type?: string | null;
}): "tattoo" | "piercing" | null {
  if (!booking) return null;
  const cat = (booking.service_category || "").toLowerCase();
  if (cat === "piercing") return "piercing";
  if (cat === "tattoo") return "tattoo";
  const bt = (booking.booking_type || "").toLowerCase();
  return bt.includes("piercing") ? "piercing" : "tattoo";
}

function ConsentPdfActions({ url, basename }: { url: string; basename: string }) {
  return (
    <div className="flex justify-end gap-1">
      <Button size="icon" variant="outline" className="h-8 w-8" asChild title="View PDF">
        <a href={url} target="_blank" rel="noreferrer">
          <Eye className="h-4 w-4" />
        </a>
      </Button>
      <Button
        size="icon"
        variant="outline"
        className="h-8 w-8"
        title="Download PDF"
        onClick={() => {
          void downloadConsentPdf(url, basename).then((ok) => {
            if (ok) toast.success("Download started");
          });
        }}
      >
        <Download className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="outline" className="h-8 w-8" title="Print PDF" onClick={() => printConsentPdf(url)}>
        <Printer className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ConsentTableRow({ row: r }: { row: ConsentRow }) {
  const basename = consentPdfBasename(r.full_name, r.created_at);
  return (
    <TableRow>
      <TableCell>
        <p className="font-medium text-sm">{r.full_name}</p>
        <p className="text-xs text-muted-foreground truncate max-w-[200px]">{r.email || r.phone || "—"}</p>
      </TableCell>
      <TableCell>
        {r.bookingType ? (
          <Badge variant={r.bookingType === "piercing" ? "secondary" : "default"} className="capitalize">
            {r.bookingType}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-sm">{r.artistName || "—"}</TableCell>
      <TableCell className="text-sm whitespace-nowrap">
        {safeFormatDate(r.bookingStartsAt, "EEE d MMM yyyy, HH:mm") ?? "—"}
      </TableCell>
      <TableCell className="text-sm whitespace-nowrap">
        {safeFormatDate(r.created_at, "EEE d MMM yyyy, HH:mm") ?? "—"}
      </TableCell>
      <TableCell className="text-right">
        {r.consent_pdf_url ? (
          <ConsentPdfActions url={r.consent_pdf_url} basename={basename} />
        ) : (
          <span className="text-xs text-muted-foreground">Pending</span>
        )}
      </TableCell>
    </TableRow>
  );
}

const AdminConsentsPanel = () => {
  const [rows, setRows] = useState<ConsentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "tattoo" | "piercing">("all");

  const loadConsents = useCallback(async () => {
    setLoading(true);
    const { data: consents, error } = await supabase
      .from("consent_signatures")
      .select("id, full_name, email, phone, created_at, booking_id, artist_id, consent_pdf_url, consent_fields")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(error.message || "Could not load consents");
      setRows([]);
      setLoading(false);
      return;
    }

    if (!consents?.length) {
      setRows([]);
      setLoading(false);
      return;
    }

    const bookingIds = consents.map((c) => c.booking_id).filter(Boolean) as string[];
    const artistIds = consents.map((c) => c.artist_id).filter(Boolean) as string[];

    const [{ data: bookings }, { data: artists }] = await Promise.all([
      bookingIds.length
        ? supabase
            .from("bookings")
            .select("id, starts_at, service_category, booking_type")
            .in("id", bookingIds)
        : Promise.resolve({ data: [] as Array<{ id: string; starts_at: string; service_category: string | null; booking_type: string | null }> }),
      artistIds.length
        ? supabase.from("profiles").select("user_id, display_name").in("user_id", artistIds)
        : Promise.resolve({ data: [] as Array<{ user_id: string; display_name: string }> }),
    ]);

    const bookingMap = new Map((bookings ?? []).map((b) => [b.id, b]));
    const artistMap = new Map((artists ?? []).map((a) => [a.user_id, a.display_name]));

    setRows(
      consents.map((c) => {
        const booking = c.booking_id ? bookingMap.get(c.booking_id) : undefined;
        const fields = (c.consent_fields as Record<string, unknown> | null) ?? null;
        const artistFromFields =
          typeof fields?.artistName === "string" && fields.artistName.trim() ? fields.artistName.trim() : null;
        return {
          id: c.id,
          full_name: c.full_name,
          email: c.email,
          phone: c.phone,
          created_at: c.created_at,
          consent_pdf_url: c.consent_pdf_url,
          bookingStartsAt: booking?.starts_at ?? null,
          bookingType: consentTypeFromBooking(booking),
          artistName: artistFromFields ?? (c.artist_id ? artistMap.get(c.artist_id) ?? null : null),
        };
      }),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadConsents();
  }, [loadConsents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== "all" && r.bookingType !== typeFilter) return false;
      if (!q) return true;
      const hay = [r.full_name, r.email, r.phone, r.artistName].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, typeFilter]);

  const consentUrl = typeof window !== "undefined" ? `${window.location.origin}/consent` : "/consent";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-teal-500" />
              Consent submissions
            </CardTitle>
            <CardDescription>All signed tattoo and piercing consent forms with PDF download.</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadConsents()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ConsentFilters search={search} setSearch={setSearch} typeFilter={typeFilter} setTypeFilter={setTypeFilter} />

        <p className="text-xs text-muted-foreground">
          Client consent link:{" "}
          <a href={consentUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
            {consentUrl}
          </a>
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading consents…
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {rows.length === 0 ? "No consent submissions yet." : "No consents match your filters."}
          </p>
        ) : (
          <div className="rounded-lg border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Artist</TableHead>
                  <TableHead>Appointment</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <ConsentTableRow key={r.id} row={r} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!loading && filtered.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} of {rows.length} submission{rows.length === 1 ? "" : "s"}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
};

function ConsentFilters({
  search,
  setSearch,
  typeFilter,
  setTypeFilter,
}: {
  search: string;
  setSearch: (v: string) => void;
  typeFilter: "all" | "tattoo" | "piercing";
  setTypeFilter: (v: "all" | "tattoo" | "piercing") => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, phone, artist…"
          className="pl-9 bg-secondary"
        />
      </div>
      <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
        <SelectTrigger className="w-full sm:w-[160px] bg-secondary">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          <SelectItem value="tattoo">Tattoo</SelectItem>
          <SelectItem value="piercing">Piercing</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export default AdminConsentsPanel;

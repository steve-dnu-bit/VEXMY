/** Velbok schedule export/import (JSON + CSV) */

export interface ScheduleBookingPayload {
  client_name: string;
  client_email?: string | null;
  client_phone?: string | null;
  tattoo_style?: string | null;
  tattoo_size?: string | null;
  tattoo_placement?: string | null;
  notes?: string | null;
  booking_type: string;
  status: string;
  starts_at: string;
  ends_at: string;
  deposit_paid?: boolean | null;
}

export interface ScheduleExportFile {
  app: string;
  version: number;
  exportedAt: string;
  dateRange?: { from: string; to: string };
  bookings: ScheduleBookingPayload[];
}

export function buildScheduleJSON(
  bookings: ScheduleBookingPayload[],
  dateRange?: { from: string; to: string }
): string {
  const payload: ScheduleExportFile = {
    app: "velbok",
    version: 1,
    exportedAt: new Date().toISOString(),
    dateRange,
    bookings: bookings.map((b) => ({
      client_name: b.client_name,
      client_email: b.client_email ?? null,
      client_phone: b.client_phone ?? null,
      tattoo_style: b.tattoo_style ?? null,
      tattoo_size: b.tattoo_size ?? null,
      tattoo_placement: b.tattoo_placement ?? null,
      notes: b.notes ?? null,
      booking_type: b.booking_type || "session",
      status: b.status || "confirmed",
      starts_at: b.starts_at,
      ends_at: b.ends_at,
      deposit_paid: b.deposit_paid ?? null,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export function parseScheduleJSON(text: string): ScheduleBookingPayload[] {
  const data = JSON.parse(text) as unknown;
  if (!data || typeof data !== "object") throw new Error("Invalid file");
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.bookings)) {
    return obj.bookings.map(normalizeBooking);
  }
  if (Array.isArray(data)) {
    return (data as unknown[]).map((x) => normalizeBooking(x as Record<string, unknown>));
  }
  throw new Error("No bookings array found");
}

function normalizeBooking(raw: Record<string, unknown>): ScheduleBookingPayload {
  const client_name = String(raw.client_name || "").trim();
  if (!client_name) throw new Error("Each booking needs client_name");
  const starts_at = String(raw.starts_at || "");
  const ends_at = String(raw.ends_at || "");
  if (!starts_at || !ends_at) throw new Error("Each booking needs starts_at and ends_at (ISO)");
  return {
    client_name,
    client_email: raw.client_email != null ? String(raw.client_email) : null,
    client_phone: raw.client_phone != null ? String(raw.client_phone) : null,
    tattoo_style: raw.tattoo_style != null ? String(raw.tattoo_style) : null,
    tattoo_size: raw.tattoo_size != null ? String(raw.tattoo_size) : null,
    tattoo_placement: raw.tattoo_placement != null ? String(raw.tattoo_placement) : null,
    notes: raw.notes != null ? String(raw.notes) : null,
    booking_type: String(raw.booking_type || "session"),
    status: String(raw.status || "confirmed"),
    starts_at,
    ends_at,
    deposit_paid: typeof raw.deposit_paid === "boolean" ? raw.deposit_paid : null,
  };
}

export function buildScheduleCSV(bookings: ScheduleBookingPayload[]): string {
  const headers = [
    "starts_at",
    "ends_at",
    "client_name",
    "client_email",
    "client_phone",
    "booking_type",
    "status",
    "tattoo_style",
    "tattoo_size",
    "tattoo_placement",
    "notes",
  ];
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = bookings.map((b) =>
    [
      b.starts_at,
      b.ends_at,
      b.client_name,
      b.client_email || "",
      b.client_phone || "",
      b.booking_type,
      b.status,
      b.tattoo_style || "",
      b.tattoo_size || "",
      b.tattoo_placement || "",
      b.notes || "",
    ].map(esc)
      .join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

export function parseScheduleCSV(text: string): ScheduleBookingPayload[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV needs a header row and at least one data row");
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else inQ = false;
        } else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === ",") {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out;
  };
  const header = parseLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const need = ["starts_at", "ends_at", "client_name"];
  for (const n of need) {
    if (idx(n) < 0) throw new Error(`CSV missing column: ${n}`);
  }
  const result: ScheduleBookingPayload[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const get = (n: string) => cols[idx(n)]?.trim() ?? "";
    const client_name = get("client_name");
    if (!client_name) continue;
    result.push({
      client_name,
      client_email: get("client_email") || null,
      client_phone: get("client_phone") || null,
      booking_type: get("booking_type") || "session",
      status: get("status") || "confirmed",
      tattoo_style: get("tattoo_style") || null,
      tattoo_size: get("tattoo_size") || null,
      tattoo_placement: get("tattoo_placement") || null,
      notes: get("notes") || null,
      starts_at: get("starts_at"),
      ends_at: get("ends_at"),
    });
  }
  return result;
}

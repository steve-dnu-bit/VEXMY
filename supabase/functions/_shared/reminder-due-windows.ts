import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/** All valid reminder offsets (appointment + deposit timing options). */
export const ALL_REMINDER_TIMINGS = ["1h", "3h", "12h", "24h", "48h", "72h", "1w"] as const;

export function timingToMs(value: string): number | null {
  switch (value) {
    case "1h":
      return 1 * 60 * 60 * 1000;
    case "3h":
      return 3 * 60 * 60 * 1000;
    case "12h":
      return 12 * 60 * 60 * 1000;
    case "24h":
      return 24 * 60 * 60 * 1000;
    case "48h":
      return 48 * 60 * 60 * 1000;
    case "72h":
      return 72 * 60 * 60 * 1000;
    case "1w":
      return 7 * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

export type ReminderDueWindow = { minIso: string; maxIso: string };

/** Booking starts_at ranges where a reminder could be due right now (± tolerance). */
export function buildReminderDueWindows(nowMs: number, toleranceMs: number): ReminderDueWindow[] {
  const windows: ReminderDueWindow[] = [];
  for (const timing of ALL_REMINDER_TIMINGS) {
    const offsetMs = timingToMs(timing);
    if (!offsetMs) continue;
    windows.push({
      minIso: new Date(nowMs - toleranceMs + offsetMs).toISOString(),
      maxIso: new Date(nowMs + toleranceMs + offsetMs).toISOString(),
    });
  }
  return windows;
}

const BOOKING_REMINDER_SELECT =
  "id, organization_id, artist_id, client_user_id, client_name, client_email, starts_at, ends_at, booking_type, service_category, deposit_paid, deposit_amount, notes, suppress_booking_notifications";

/** Fetch bookings whose starts_at falls in any due window (deduped, sorted). */
export async function fetchBookingsDueForReminders(
  admin: SupabaseClient,
  windows: ReminderDueWindow[],
): Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }> {
  const byId = new Map<string, Record<string, unknown>>();

  for (const window of windows) {
    const { data: rows, error } = await admin
      .from("bookings")
      .select(BOOKING_REMINDER_SELECT)
      .gte("starts_at", window.minIso)
      .lte("starts_at", window.maxIso)
      .neq("status", "cancelled")
      .eq("suppress_booking_notifications", false);

    if (error) return { data: null, error };
    for (const row of rows || []) {
      byId.set(row.id as string, row as Record<string, unknown>);
    }
  }

  const merged = [...byId.values()].sort((a, b) =>
    String(a.starts_at).localeCompare(String(b.starts_at)),
  );
  return { data: merged, error: null };
}

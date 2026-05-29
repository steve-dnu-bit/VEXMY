export const CLIENT_CONDUCT_THRESHOLDS = {
  noShows: 2,
  lateCancellations: 3,
  reschedules: 5,
} as const;

export type ClientConductCounts = {
  no_shows_count: number;
  late_cancellations_count: number;
  reschedules_count: number;
};

export function normalizeClientEmail(email: string | null | undefined): string | null {
  const v = (email || "").trim().toLowerCase();
  return v || null;
}

export function normalizeClientPhone(phone: string | null | undefined): string | null {
  const v = (phone || "").replace(/\s/g, "");
  return v || null;
}

export function buildClientConductKey(input: {
  clientUserId?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientName?: string | null;
}): string {
  const userId = (input.clientUserId || "").trim();
  if (userId) return `uid:${userId}`;
  const email = normalizeClientEmail(input.clientEmail);
  if (email) return `email:${email}`;
  const phone = normalizeClientPhone(input.clientPhone);
  if (phone) return `phone:${phone}`;
  return `name:${(input.clientName || "").trim().toLowerCase()}`;
}

export function isClientConductHighRisk(c: ClientConductCounts): boolean {
  return (
    Number(c.no_shows_count || 0) >= CLIENT_CONDUCT_THRESHOLDS.noShows ||
    Number(c.late_cancellations_count || 0) >= CLIENT_CONDUCT_THRESHOLDS.lateCancellations ||
    Number(c.reschedules_count || 0) >= CLIENT_CONDUCT_THRESHOLDS.reschedules
  );
}

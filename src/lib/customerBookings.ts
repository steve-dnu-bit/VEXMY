/** PostgREST filter: bookings owned by portal user id or matching login email. */
export function buildCustomerBookingsOrFilter(userId: string, email?: string | null): string {
  const normalizedEmail = (email || "").trim().toLowerCase();
  if (normalizedEmail) {
    return `client_user_id.eq.${userId},client_email.ilike.${normalizedEmail}`;
  }
  return `client_user_id.eq.${userId}`;
}

/** Benign race from Supabase's legacy navigator.locks cross-tab coordination. */
export function isSupabaseAuthLockError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error ?? "");
  const name = error instanceof Error ? error.name : "";
  return (
    /lock broken by another request/i.test(message) ||
    (/navigator lock/i.test(message) && /abort/i.test(message)) ||
    (name === "AbortError" && /lock/i.test(message))
  );
}

/** Drop lock races; otherwise return the original message or fallback. */
export function userFacingErrorMessage(error: unknown, fallback: string): string | null {
  if (isSupabaseAuthLockError(error)) return null;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const msg = String((error as { message?: unknown }).message ?? "").trim();
    if (msg) return msg;
  }
  return fallback;
}

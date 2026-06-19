import { formatStripeTerminalErrorMessage } from "@/lib/terminal/stripeTerminalErrorMessages";

function extractErrorRecord(error: unknown): Record<string, unknown> | null {
  if (!error || typeof error !== "object") return null;
  return error as Record<string, unknown>;
}

export function formatTerminalError(error: unknown, fallback: string): string {
  const record = extractErrorRecord(error);
  const code =
    (typeof record?.code === "string" && record.code) ||
    (typeof record?.errorCode === "string" && record.errorCode) ||
    null;
  const message =
    (error instanceof Error && error.message.trim()) ||
    (typeof record?.message === "string" && record.message.trim()) ||
    (typeof record?.errorMessage === "string" && record.errorMessage.trim()) ||
    null;

  const combined = [code, message].filter(Boolean).join(" — ");
  if (combined) return formatStripeTerminalErrorMessage(combined);

  if (typeof error === "string" && error.trim()) {
    return formatStripeTerminalErrorMessage(error);
  }

  if (record) {
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") {
        return formatStripeTerminalErrorMessage(serialized);
      }
    } catch {
      /* ignore */
    }
  }

  return formatStripeTerminalErrorMessage(fallback);
}

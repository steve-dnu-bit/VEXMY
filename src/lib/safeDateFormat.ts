import { format, isValid, parseISO } from "date-fns";

/** Format ISO timestamps without crashing the page on bad database values. */
export function safeFormatDate(value: string | null | undefined, pattern: string): string | null {
  if (!value) return null;
  const parsed = parseISO(value);
  const date = isValid(parsed) ? parsed : new Date(value);
  if (!isValid(date)) return null;
  try {
    return format(date, pattern);
  } catch {
    return null;
  }
}

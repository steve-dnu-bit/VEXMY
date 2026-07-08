/** E.164 phone for Twilio SMS/WhatsApp (handles UK numbers stored as 07…). */
export function normalizeSmsE164(phone: string | null | undefined): string | null {
  const trimmed = (phone || "").trim();
  if (!trimmed) return null;

  let raw = trimmed.replace(/[\s\-().]/g, "");
  if (raw.startsWith("00")) raw = `+${raw.slice(2)}`;

  if (raw.startsWith("+")) {
    const digits = raw.slice(1).replace(/\D/g, "");
    if (!digits) return null;
    if (digits.startsWith("0") && digits.length === 11) {
      return `+44${digits.slice(1)}`;
    }
    return `+${digits}`;
  }

  if (raw.startsWith("0")) {
    const digits = raw.slice(1).replace(/\D/g, "");
    return digits ? `+44${digits}` : null;
  }

  const digits = raw.replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}

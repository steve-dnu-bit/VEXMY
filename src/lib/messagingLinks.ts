/** Normalize a phone number for wa.me links (digits only, with sensible UK 0→44 handling). */
export function normalizePhoneForWhatsApp(phone: string): string | null {
  let raw = phone.trim().replace(/[\s\-().]/g, "");
  if (!raw) return null;
  if (raw.startsWith("00")) raw = `+${raw.slice(2)}`;
  if (raw.startsWith("+")) {
    const digits = raw.slice(1).replace(/\D/g, "");
    return digits || null;
  }
  if (raw.startsWith("0")) {
    const digits = raw.slice(1).replace(/\D/g, "");
    return digits ? `44${digits}` : null;
  }
  const digits = raw.replace(/\D/g, "");
  return digits || null;
}

export function buildWhatsAppUrl(phone: string, message?: string): string | null {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return null;
  const base = `https://wa.me/${normalized}`;
  if (message?.trim()) return `${base}?text=${encodeURIComponent(message.trim())}`;
  return base;
}

export function buildInstagramDmUrl(handle: string): string | null {
  const username = handle.trim().replace(/^@/, "").replace(/\s/g, "");
  if (!username) return null;
  return `https://ig.me/m/${encodeURIComponent(username)}`;
}

export function extractClientUserIdFromListKey(listKey: string): string | null {
  if (!listKey.startsWith("profile:")) return null;
  const id = listKey.slice("profile:".length).trim();
  return id || null;
}

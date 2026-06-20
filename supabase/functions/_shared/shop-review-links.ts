export type ShopReviewLink = { label: string; url: string };

function normalizeReviewUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

export function parseShopReviewLinks(raw: unknown): ShopReviewLink[] {
  if (!Array.isArray(raw)) return [];
  const out: ShopReviewLink[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const label = String((row as { label?: unknown }).label ?? "").trim();
    const url = normalizeReviewUrl(String((row as { url?: unknown }).url ?? ""));
    if (!label || !/^https?:\/\//i.test(url)) continue;
    out.push({ label, url });
    if (out.length >= 8) break;
  }
  return out;
}

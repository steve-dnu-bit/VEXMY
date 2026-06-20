export type ShopReviewLink = { label: string; url: string };

export function parseShopReviewLinks(raw: unknown): ShopReviewLink[] {
  if (!Array.isArray(raw)) return [];
  const out: ShopReviewLink[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const label = String((row as { label?: unknown }).label ?? "").trim();
    const url = String((row as { url?: unknown }).url ?? "").trim();
    if (!label || !/^https?:\/\//i.test(url)) continue;
    out.push({ label, url });
    if (out.length >= 8) break;
  }
  return out;
}

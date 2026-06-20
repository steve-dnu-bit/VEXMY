import { supabase } from "@/integrations/supabase/client";
import { getUserOrganizationId, loadShopSettings } from "@/lib/shopSettings";

export type ShopReviewLink = {
  label: string;
  url: string;
};

export type ShopReviewSettings = {
  links: ShopReviewLink[];
  message: string;
};

const MAX_LINKS = 8;

export function normalizeReviewLinks(raw: unknown): ShopReviewLink[] {
  if (!Array.isArray(raw)) return [];
  const out: ShopReviewLink[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const label = String((row as { label?: unknown }).label ?? "").trim();
    const url = String((row as { url?: unknown }).url ?? "").trim();
    if (!label || !/^https?:\/\//i.test(url)) continue;
    out.push({ label, url });
    if (out.length >= MAX_LINKS) break;
  }
  return out;
}

export async function loadShopReviewSettings(): Promise<ShopReviewSettings> {
  const orgId = await getUserOrganizationId();
  if (!orgId) return { links: [], message: "" };

  const { data, error } = await supabase
    .from("shop_settings" as any)
    .select("review_links, review_email_message")
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error || !data) return { links: [], message: "" };
  return {
    links: normalizeReviewLinks((data as { review_links?: unknown }).review_links),
    message: String((data as { review_email_message?: unknown }).review_email_message ?? "").trim(),
  };
}

export async function saveShopReviewSettings(settings: ShopReviewSettings): Promise<{ error: string | null }> {
  const shop = await loadShopSettings();
  if (!shop?.id) return { error: "Shop settings not found" };

  const links = normalizeReviewLinks(settings.links);
  const { error } = await supabase
    .from("shop_settings" as any)
    .update({
      review_links: links,
      review_email_message: settings.message.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", shop.id);

  return { error: error?.message ?? null };
}

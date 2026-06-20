import { supabase } from "@/integrations/supabase/client";
import { getUserOrganizationId } from "@/lib/shopSettings";

export type ShopReviewLink = {
  label: string;
  url: string;
};

export type ShopReviewSettings = {
  links: ShopReviewLink[];
  message: string;
};

const MAX_LINKS = 8;

/** Accept pasted URLs without a scheme (e.g. g.page/..., www.google.com/...). */
export function normalizeReviewUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

export function normalizeReviewLinks(raw: unknown): ShopReviewLink[] {
  if (!Array.isArray(raw)) return [];
  const out: ShopReviewLink[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const label = String((row as { label?: unknown }).label ?? "").trim();
    const url = normalizeReviewUrl(String((row as { url?: unknown }).url ?? ""));
    if (!label || !/^https?:\/\//i.test(url)) continue;
    out.push({ label, url });
    if (out.length >= MAX_LINKS) break;
  }
  return out;
}

export function hasDraftReviewLink(link: ShopReviewLink): boolean {
  return !!link.label.trim() || !!link.url.trim();
}

/** Short Google “Share” links often deep-link into apps (Cast, Google app) instead of a review page. */
export function isUnreliableReviewShareUrl(url: string): boolean {
  try {
    const host = new URL(normalizeReviewUrl(url)).hostname.toLowerCase();
    return host === "share.google" || host === "share.google.com" || host === "goo.gl" || host === "maps.app.goo.gl";
  } catch {
    return false;
  }
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
  const orgId = await getUserOrganizationId();
  if (!orgId) {
    return { error: "No studio organization found for your account." };
  }

  const drafts = settings.links.filter(hasDraftReviewLink);
  const links = normalizeReviewLinks(settings.links);

  if (drafts.length > 0 && links.length === 0) {
    return {
      error: "Each review link needs a platform name and a valid URL (https:// is added automatically if missing).",
    };
  }

  const { data, error } = await supabase
    .from("shop_settings" as any)
    .update({
      review_links: links,
      review_email_message: settings.message.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", orgId)
    .select("id, review_links")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) {
    return {
      error: "Could not save review links. Only studio owners/admins can change these settings.",
    };
  }

  return { error: null };
}

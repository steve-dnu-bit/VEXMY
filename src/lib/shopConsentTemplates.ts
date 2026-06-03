import { supabase } from "@/integrations/supabase/client";
import {
  defaultConsentForSlug,
  defaultConsentTemplates,
  type ConsentFormContent,
  type ConsentFormTemplateRow,
} from "@/lib/defaultConsentTemplates";

export type { ConsentFormContent, ConsentFormTemplateRow };

export { slugFromBookingCategory } from "@/lib/defaultConsentTemplates";

function parseContent(raw: unknown, slug: string): ConsentFormContent {
  const fallback = defaultConsentForSlug(slug) ?? defaultConsentForSlug("tattoo")!;
  if (!raw || typeof raw !== "object") return fallback;
  const c = raw as Record<string, unknown>;
  return {
    formTitle: String(c.formTitle || fallback.formTitle),
    pdfTitle: String(c.pdfTitle || fallback.pdfTitle),
    introText: String(c.introText || fallback.introText),
    healthQuestions: Array.isArray(c.healthQuestions)
      ? (c.healthQuestions as string[]).map(String)
      : fallback.healthQuestions,
    statements: Array.isArray(c.statements) ? (c.statements as string[]).map(String) : fallback.statements,
    placementLabel: String(c.placementLabel || fallback.placementLabel),
    declColumns: c.declColumns === 1 ? 1 : c.declColumns === 2 ? 2 : fallback.declColumns,
    declarations: {
      agree: String((c.declarations as Record<string, unknown>)?.agree ?? fallback.declarations.agree),
      age: String((c.declarations as Record<string, unknown>)?.age ?? fallback.declarations.age),
      sober: String((c.declarations as Record<string, unknown>)?.sober ?? fallback.declarations.sober),
      risk: String((c.declarations as Record<string, unknown>)?.risk ?? fallback.declarations.risk),
      photo: String((c.declarations as Record<string, unknown>)?.photo ?? fallback.declarations.photo),
    },
  };
}

function rowToTemplate(row: Record<string, unknown>): ConsentFormTemplateRow {
  const slug = String(row.slug || "tattoo");
  return {
    id: row.id as string | undefined,
    slug,
    name: String(row.name || slug),
    version: String(row.version || "1.0"),
    isActive: row.is_active !== false,
    defaultForCategory:
      row.default_for_category === "piercing" ? "piercing" : row.default_for_category === "tattoo" ? "tattoo" : null,
    sortOrder: Number(row.sort_order ?? 0),
    content: parseContent(row.content, slug),
  };
}

export async function getShopOrganizationId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: orgId, error } = await supabase.rpc("get_user_organization_id", { _user_id: user.id });
  if (!error && orgId) return orgId as string;

  const { data: orgs } = await supabase.from("organizations").select("id").order("created_at", { ascending: true }).limit(2);
  if (orgs?.length) return orgs[0].id;
  return null;
}

export async function ensureDefaultConsentTemplates(orgId: string): Promise<void> {
  const { count } = await supabase
    .from("consent_form_templates" as any)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);

  if ((count ?? 0) > 0) return;

  const defaults = defaultConsentTemplates();
  await supabase.from("consent_form_templates" as any).insert(
    defaults.map((t) => ({
      organization_id: orgId,
      slug: t.slug,
      name: t.name,
      version: t.version,
      is_active: t.isActive,
      default_for_category: t.defaultForCategory,
      sort_order: t.sortOrder,
      content: t.content,
    })),
  );
}

export async function loadShopConsentTemplates(includeInactive = false): Promise<ConsentFormTemplateRow[]> {
  const orgId = await getShopOrganizationId();
  if (!orgId) return defaultConsentTemplates();

  await ensureDefaultConsentTemplates(orgId);

  let query = supabase
    .from("consent_form_templates" as any)
    .select("id, slug, name, version, is_active, default_for_category, sort_order, content")
    .eq("organization_id", orgId)
    .order("sort_order", { ascending: true });

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error || !data?.length) return defaultConsentTemplates();

  return data.map((row) => rowToTemplate(row as Record<string, unknown>));
}

export async function loadConsentTemplateBySlug(slug: string): Promise<ConsentFormTemplateRow | null> {
  const templates = await loadShopConsentTemplates(true);
  return templates.find((t) => t.slug === slug && t.isActive) ?? templates.find((t) => t.slug === slug) ?? null;
}

export function resolveTemplateForBooking(
  templates: ConsentFormTemplateRow[],
  category: string,
  bookingType: string,
  formSlugFromUrl: string | null,
): ConsentFormTemplateRow | null {
  if (formSlugFromUrl) {
    const byUrl = templates.find((t) => t.slug === formSlugFromUrl && t.isActive);
    if (byUrl) return byUrl;
  }

  const cat = (category || "").toLowerCase();
  const inferred: "tattoo" | "piercing" =
    cat === "piercing" || (bookingType || "").toLowerCase().includes("piercing") ? "piercing" : "tattoo";

  const byDefault = templates.find((t) => t.isActive && t.defaultForCategory === inferred);
  if (byDefault) return byDefault;

  const bySlug = templates.find((t) => t.isActive && t.slug === inferred);
  if (bySlug) return bySlug;

  return defaultConsentTemplates().find((t) => t.slug === inferred) ?? null;
}

export async function saveConsentFormTemplate(template: ConsentFormTemplateRow): Promise<{ error: string | null }> {
  const orgId = await getShopOrganizationId();
  if (!orgId) return { error: "No studio organization found" };

  if (template.defaultForCategory) {
    await supabase
      .from("consent_form_templates" as any)
      .update({ default_for_category: null })
      .eq("organization_id", orgId)
      .eq("default_for_category", template.defaultForCategory)
      .neq("slug", template.slug);
  }

  const payload = {
    organization_id: orgId,
    slug: template.slug,
    name: template.name,
    version: template.version,
    is_active: template.isActive,
    default_for_category: template.defaultForCategory,
    sort_order: template.sortOrder,
    content: template.content,
    updated_at: new Date().toISOString(),
  };

  const { error } = template.id
    ? await supabase.from("consent_form_templates" as any).update(payload).eq("id", template.id)
    : await supabase.from("consent_form_templates" as any).upsert(payload, { onConflict: "organization_id,slug" });

  return { error: error?.message ?? null };
}

export async function deleteConsentFormTemplate(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("consent_form_templates" as any).delete().eq("id", id);
  return { error: error?.message ?? null };
}

export function consentFormPublicUrl(slug: string): string {
  if (typeof window === "undefined") return `/consent?form=${encodeURIComponent(slug)}`;
  return `${window.location.origin}/consent?form=${encodeURIComponent(slug)}`;
}

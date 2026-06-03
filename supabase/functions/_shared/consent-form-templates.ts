import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  defaultConsentForSlug,
  defaultConsentTemplates,
  type ConsentFormContent,
  type ConsentFormTemplateRow,
} from "./default-consent-templates.ts";

export type { ConsentFormContent, ConsentFormTemplateRow };

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

export async function consentOrgForDeployment(admin: SupabaseClient): Promise<string | null> {
  const { data, error } = await admin.rpc("aftercare_org_for_deployment");
  if (!error && data) return data as string;
  const { data: orgs } = await admin.from("organizations").select("id").order("created_at", { ascending: true }).limit(1);
  return orgs?.[0]?.id ?? null;
}

export async function loadConsentFormTemplateBySlug(
  admin: SupabaseClient,
  slug: string,
  organizationId?: string | null,
): Promise<ConsentFormTemplateRow | null> {
  const orgId = organizationId ?? (await consentOrgForDeployment(admin));
  if (orgId) {
    const { data } = await admin
      .from("consent_form_templates")
      .select("id, slug, name, version, is_active, default_for_category, sort_order, content")
      .eq("organization_id", orgId)
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    if (data) return rowToTemplate(data as Record<string, unknown>);
  }

  const fallback = defaultConsentTemplates().find((t) => t.slug === slug);
  return fallback ?? null;
}

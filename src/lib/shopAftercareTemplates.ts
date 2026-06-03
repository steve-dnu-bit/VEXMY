import { supabase } from "@/integrations/supabase/client";
import {
  defaultAftercareForKind,
  defaultShopAftercareTemplates,
  type AftercareKind,
  type AftercareSection,
  type ShopAftercareTemplate,
} from "@/lib/defaultAftercareTemplates";

export type { AftercareKind, AftercareSection, ShopAftercareTemplate };

function rowToTemplate(row: Record<string, unknown>): ShopAftercareTemplate {
  const kind = row.kind as AftercareKind;
  const defaults = defaultAftercareForKind(kind);
  const sections = Array.isArray(row.sections) ? (row.sections as AftercareSection[]) : defaults.sections;
  return {
    kind,
    enabled: row.enabled !== false,
    badge: String(row.badge || defaults.badge),
    title: String(row.title || defaults.title),
    emailSubject: String(row.email_subject || defaults.emailSubject),
    introTemplate: String(row.intro_template || defaults.introTemplate),
    sections,
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
  if (orgs?.length === 1) return orgs[0].id;
  if (orgs?.length) return orgs[0].id;
  return null;
}

export async function loadShopAftercareTemplates(): Promise<ShopAftercareTemplate[]> {
  const orgId = await getShopOrganizationId();
  if (!orgId) return defaultShopAftercareTemplates();

  const { data, error } = await supabase
    .from("shop_aftercare_templates" as any)
    .select("kind, enabled, badge, title, email_subject, intro_template, sections")
    .eq("organization_id", orgId);

  if (error || !data?.length) return defaultShopAftercareTemplates();

  const byKind = new Map<AftercareKind, ShopAftercareTemplate>();
  for (const row of data) {
    const kind = row.kind as AftercareKind;
    if (kind === "tattoo" || kind === "piercing") {
      byKind.set(kind, rowToTemplate(row as Record<string, unknown>));
    }
  }

  return (["tattoo", "piercing"] as const).map((kind) => byKind.get(kind) ?? { kind, enabled: true, ...defaultAftercareForKind(kind) });
}

export async function saveShopAftercareTemplate(template: ShopAftercareTemplate): Promise<{ error: string | null }> {
  const orgId = await getShopOrganizationId();
  if (!orgId) return { error: "No studio organization found" };

  const { error } = await supabase.from("shop_aftercare_templates" as any).upsert(
    {
      organization_id: orgId,
      kind: template.kind,
      enabled: template.enabled,
      badge: template.badge,
      title: template.title,
      email_subject: template.emailSubject,
      intro_template: template.introTemplate,
      sections: template.sections,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,kind" },
  );

  return { error: error?.message ?? null };
}

export async function resetShopAftercareTemplate(kind: AftercareKind): Promise<{ error: string | null }> {
  const defaults = defaultAftercareForKind(kind);
  return saveShopAftercareTemplate({ kind, enabled: true, ...defaults });
}

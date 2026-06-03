import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  defaultAftercareForKind,
  type AftercareKind,
  type AftercareTemplateContent,
} from "./default-aftercare-templates.ts";

export type ShopAftercareRow = AftercareTemplateContent & {
  kind: AftercareKind;
  enabled: boolean;
};

function rowToTemplate(row: Record<string, unknown>): ShopAftercareRow {
  const kind = row.kind as AftercareKind;
  const defaults = defaultAftercareForKind(kind);
  const sections = Array.isArray(row.sections) ? row.sections : defaults.sections;
  return {
    kind,
    enabled: row.enabled !== false,
    badge: String(row.badge || defaults.badge),
    title: String(row.title || defaults.title),
    emailSubject: String(row.email_subject || defaults.emailSubject),
    introTemplate: String(row.intro_template || defaults.introTemplate),
    sections: sections as AftercareTemplateContent["sections"],
  };
}

export async function aftercareOrgForDeployment(admin: SupabaseClient): Promise<string | null> {
  const { data, error } = await admin.rpc("aftercare_org_for_deployment");
  if (!error && data) return data as string;
  const { data: orgs } = await admin.from("organizations").select("id").order("created_at", { ascending: true }).limit(1);
  return orgs?.[0]?.id ?? null;
}

export async function loadShopAftercareTemplates(
  admin: SupabaseClient,
  organizationId: string | null,
): Promise<Map<AftercareKind, ShopAftercareRow>> {
  const map = new Map<AftercareKind, ShopAftercareRow>();
  const orgId = organizationId ?? (await aftercareOrgForDeployment(admin));

  if (orgId) {
    const { data: rows } = await admin
      .from("shop_aftercare_templates")
      .select("kind, enabled, badge, title, email_subject, intro_template, sections")
      .eq("organization_id", orgId);
    for (const row of rows || []) {
      const kind = row.kind as AftercareKind;
      if (kind === "tattoo" || kind === "piercing") {
        map.set(kind, rowToTemplate(row as Record<string, unknown>));
      }
    }
  }

  for (const kind of ["tattoo", "piercing"] as const) {
    if (!map.has(kind)) {
      map.set(kind, { kind, enabled: true, ...defaultAftercareForKind(kind) });
    }
  }

  return map;
}

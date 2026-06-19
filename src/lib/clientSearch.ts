import { supabase } from "@/integrations/supabase/client";

export type ClientPick = {
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  client_user_id: string | null;
};

function escapeIlike(q: string): string {
  return q.replace(/[%_\\]/g, "\\$&");
}

function dedupeKey(c: ClientPick): string {
  return `${c.client_name.trim().toLowerCase()}|${(c.client_email || "").toLowerCase()}|${(c.client_phone || "").replace(/\s/g, "")}|${c.client_user_id || ""}`;
}

/** Search clients from org-scoped bookings, profiles, and optional imports (RLS applies). */
export async function searchOrganizationClients(query: string, limit = 28): Promise<ClientPick[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const pattern = `%${escapeIlike(q)}%`;
  const [byName, byEmail, profs, importedContacts] = await Promise.all([
    supabase
      .from("bookings")
      .select("client_name, client_email, client_phone, client_user_id")
      .ilike("client_name", pattern)
      .order("starts_at", { ascending: false })
      .limit(45),
    supabase
      .from("bookings")
      .select("client_name, client_email, client_phone, client_user_id")
      .ilike("client_email", pattern)
      .order("starts_at", { ascending: false })
      .limit(45),
    supabase.from("profiles").select("user_id, display_name, phone").ilike("display_name", pattern).limit(20),
    supabase
      .from("contacts_import" as any)
      .select("name, email, phone")
      .or(`name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
      .limit(60),
  ]);

  const map = new Map<string, ClientPick>();
  const add = (c: ClientPick) => {
    if (!c.client_name.trim()) return;
    const k = dedupeKey(c);
    if (!map.has(k)) map.set(k, c);
  };

  for (const r of [...(byName.data ?? []), ...(byEmail.data ?? [])]) {
    add({
      client_name: r.client_name,
      client_email: r.client_email,
      client_phone: r.client_phone,
      client_user_id: r.client_user_id ?? null,
    });
  }
  for (const p of profs.data ?? []) {
    const name = (p.display_name || "").trim();
    if (!name) continue;
    add({
      client_name: name,
      client_email: null,
      client_phone: p.phone ?? null,
      client_user_id: p.user_id,
    });
  }
  for (const c of (importedContacts as any)?.data ?? []) {
    const name = String(c?.name || "").trim();
    if (!name) continue;
    add({
      client_name: name,
      client_email: c?.email ? String(c.email).trim().toLowerCase() : null,
      client_phone: c?.phone ? String(c.phone).trim() : null,
      client_user_id: null,
    });
  }

  return [...map.values()].slice(0, limit);
}

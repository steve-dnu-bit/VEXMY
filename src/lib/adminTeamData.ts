import { supabase } from "@/integrations/supabase/client";
import { loadOrganizationCustomerIds, loadOrganizationMemberIds } from "@/lib/organizationMembers";

export interface AdminProfile {
  user_id: string;
  display_name: string;
}

export interface AdminPermission {
  user_id: string;
  feature: string;
  granted: boolean;
}

export interface AdminRoleRow {
  user_id: string;
  role: string;
}

export interface AdminDefaultRow {
  role_template: string;
  feature: string;
  granted: boolean;
}

export interface AdminTeamData {
  profiles: AdminProfile[];
  permissions: AdminPermission[];
  rolesByUser: Record<string, string[]>;
  defaults: AdminDefaultRow[];
  /** False when the user has no studio org — avoids loading every profile in the database. */
  hasOrganization: boolean;
}

async function queryInChunks<T>(
  ids: string[],
  query: (chunk: string[]) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  if (ids.length === 0) return [];
  const out: T[] = [];
  const chunkSize = 100;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await query(chunk);
    if (error) {
      console.warn("Admin team query failed:", error.message);
      break;
    }
    if (data?.length) out.push(...data);
  }
  return out;
}

function rolesToMap(rows: AdminRoleRow[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const row of rows) {
    if (!map[row.user_id]) map[row.user_id] = [];
    map[row.user_id].push(row.role);
  }
  return map;
}

/** Load permission matrix data scoped to the current studio (never all tenants). */
export async function loadAdminTeamData(): Promise<AdminTeamData> {
  const [orgMemberIds, customerIds, defRes] = await Promise.all([
    loadOrganizationMemberIds(),
    loadOrganizationCustomerIds(),
    supabase.from("permission_role_defaults").select("role_template, feature, granted"),
  ]);

  const defaults = (defRes.data ?? []) as AdminDefaultRow[];

  if (!orgMemberIds || orgMemberIds.size === 0) {
    return {
      profiles: [],
      permissions: [],
      rolesByUser: {},
      defaults,
      hasOrganization: false,
    };
  }

  const userIds = [...new Set([...orgMemberIds, ...customerIds])];

  const [profiles, permissions, roles] = await Promise.all([
    queryInChunks(userIds, (chunk) =>
      supabase.from("profiles").select("user_id, display_name").in("user_id", chunk),
    ),
    queryInChunks(userIds, (chunk) =>
      supabase.from("user_permissions").select("user_id, feature, granted").in("user_id", chunk),
    ),
    queryInChunks(userIds, (chunk) =>
      supabase.from("user_roles").select("user_id, role").in("user_id", chunk),
    ),
  ]);

  return {
    profiles: profiles as AdminProfile[],
    permissions: permissions as AdminPermission[],
    rolesByUser: rolesToMap(roles as AdminRoleRow[]),
    defaults,
    hasOrganization: true,
  };
}

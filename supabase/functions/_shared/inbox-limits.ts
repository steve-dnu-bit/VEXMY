import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type InboxLimitsPayload = {
  organization_id?: string;
  staff_inbox?: boolean;
  monthly_cap?: number;
  max_channels?: number;
  inbound_count?: number;
  outbound_count?: number;
  total_count?: number;
  remaining?: number;
  overage_rate_gbp?: number;
  channels?: Record<string, boolean>;
  error?: string;
};

export type InboxQuotaClaim = {
  allowed?: boolean;
  error?: string;
  cap?: number;
  used?: number;
  remaining?: number;
  overage_count?: number;
  in_overage?: boolean;
  direction?: string;
};

export async function getOrgInboxLimits(
  admin: SupabaseClient,
  organizationId: string,
): Promise<InboxLimitsPayload> {
  const { data, error } = await admin.rpc("get_org_inbox_limits", { _org_id: organizationId });
  if (error) throw new Error(error.message);
  return (data as InboxLimitsPayload) ?? {};
}

export async function claimInboxMessageQuota(
  admin: SupabaseClient,
  organizationId: string,
  direction: "inbound" | "outbound",
): Promise<InboxQuotaClaim> {
  const { data, error } = await admin.rpc("claim_inbox_message_quota", {
    _org_id: organizationId,
    _direction: direction,
  });
  if (error) throw new Error(error.message);
  return (data as InboxQuotaClaim) ?? { allowed: false, error: "empty_response" };
}

export async function isInboxChannelAllowedForOrg(
  admin: SupabaseClient,
  organizationId: string,
  channel: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc("org_inbox_channel_allowed", {
    _org_id: organizationId,
    _channel: channel,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

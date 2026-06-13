import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  getInboxLimitsFromPlan,
  isInboxChannelAllowed,
  type InboxChannel,
  type InboxLimits,
} from "@/lib/inboxPlan";
import { useSubscription } from "@/hooks/useSubscription";

export type InboxUsageSnapshot = {
  monthlyCap: number;
  inboundCount: number;
  outboundCount: number;
  totalCount: number;
  remaining: number;
  overageCount: number;
  overageRateGbp: number;
  inOverage: boolean;
  channels: Record<InboxChannel, boolean>;
};

async function fetchInboxUsage(organizationId: string): Promise<InboxUsageSnapshot | null> {
  const { data, error } = await supabase.rpc("get_org_inbox_limits", { _org_id: organizationId });
  if (error || !data || typeof data !== "object") return null;

  const row = data as Record<string, unknown>;
  const channels = (row.channels as Record<string, boolean> | undefined) ?? {};

  return {
    monthlyCap: Number(row.monthly_cap ?? 0),
    inboundCount: Number(row.inbound_count ?? 0),
    outboundCount: Number(row.outbound_count ?? 0),
    totalCount: Number(row.total_count ?? 0),
    remaining: Number(row.remaining ?? 0),
    overageCount: Number(row.overage_count ?? 0),
    overageRateGbp: Number(row.overage_rate_gbp ?? 0),
    inOverage: !!row.in_overage,
    channels: {
      email: !!channels.email,
      whatsapp: !!channels.whatsapp,
      instagram: !!channels.instagram,
      facebook: !!channels.facebook,
      sms: !!channels.sms,
    },
  };
}

async function fetchPrimaryChannel(organizationId: string): Promise<InboxChannel | null> {
  const { data, error } = await supabase
    .from("shop_settings")
    .select("inbox_primary_channel")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error || !data?.inbox_primary_channel) return null;
  const ch = String(data.inbox_primary_channel).toLowerCase();
  if (["whatsapp", "instagram", "facebook", "email", "sms"].includes(ch)) {
    return ch as InboxChannel;
  }
  return null;
}

export function useInboxPlan() {
  const { data: subscription, isActive, isLoading } = useSubscription();

  const primaryChannelQuery = useQuery({
    queryKey: ["inbox-primary-channel", subscription?.organizationId],
    queryFn: () => fetchPrimaryChannel(subscription!.organizationId!),
    enabled: !!subscription?.organizationId,
    staleTime: 60_000,
  });

  const primaryChannel = primaryChannelQuery.data ?? null;

  const limits = useMemo<InboxLimits>(
    () => getInboxLimitsFromPlan(subscription?.plan ?? null, isActive, primaryChannel),
    [subscription?.plan, isActive, primaryChannel],
  );

  const usageQuery = useQuery({
    queryKey: ["inbox-usage", subscription?.organizationId],
    queryFn: () =>
      subscription?.organizationId ? fetchInboxUsage(subscription.organizationId) : null,
    enabled: !!subscription?.organizationId && limits.staffInbox,
    staleTime: 30_000,
  });

  const canUseChannel = (channel: InboxChannel) =>
    isInboxChannelAllowed(limits, channel, primaryChannel);

  return {
    isLoading: isLoading || primaryChannelQuery.isLoading,
    isActive,
    planId: subscription?.plan?.id ?? subscription?.subscription?.planId ?? null,
    organizationId: subscription?.organizationId ?? null,
    primaryChannel,
    limits,
    usage: usageQuery.data ?? null,
    usageLoading: usageQuery.isLoading,
    refreshUsage: usageQuery.refetch,
    canUseChannel,
    hasStaffInbox: limits.staffInbox,
    hasContactLinksOnly: limits.contactLinksOnly,
  };
}

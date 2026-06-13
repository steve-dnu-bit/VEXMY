import type { PlanFeatures, SubscriptionPlan } from "@/hooks/useSubscription";

export const INBOX_CHANNELS = ["email", "whatsapp", "instagram", "facebook", "sms"] as const;
export type InboxChannel = (typeof INBOX_CHANNELS)[number];

const CHANNEL_FEATURE_KEY: Record<InboxChannel, keyof PlanFeatures> = {
  email: "inbox_email",
  whatsapp: "inbox_whatsapp",
  instagram: "inbox_instagram",
  facebook: "inbox_facebook",
  sms: "inbox_sms",
};

export type InboxLimits = {
  staffInbox: boolean;
  monthlyCap: number;
  maxChannels: number;
  overageRateGbp: number;
  allowedChannels: InboxChannel[];
  contactLinksOnly: boolean;
};

export function planFeatureNumber(
  plan: SubscriptionPlan | null,
  feature: keyof PlanFeatures,
  subscriptionActive: boolean,
): number {
  if (!subscriptionActive || !plan?.features) return 0;
  const value = plan.features[feature];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function planHasBooleanFeature(
  plan: SubscriptionPlan | null,
  feature: keyof PlanFeatures,
  subscriptionActive: boolean,
): boolean {
  if (!subscriptionActive || !plan?.features) return false;
  return plan.features[feature] === true;
}

export function getAllowedInboxChannels(
  features: PlanFeatures,
  primaryChannel?: InboxChannel | null,
): InboxChannel[] {
  const maxChannels = typeof features.inbox_max_channels === "number" ? features.inbox_max_channels : 0;
  if (maxChannels <= 0 || !features.staff_inbox) return [];

  const channels: InboxChannel[] = [];
  if (features.inbox_email) channels.push("email");

  const socialChannels = (["whatsapp", "instagram", "facebook", "sms"] as const).filter(
    (channel) => features[CHANNEL_FEATURE_KEY[channel]] === true,
  );

  if (socialChannels.length > 0) {
    for (const channel of socialChannels) {
      if (!channels.includes(channel)) channels.push(channel);
    }
    return channels;
  }

  if (primaryChannel && primaryChannel !== "email" && !channels.includes(primaryChannel)) {
    channels.push(primaryChannel);
  }

  return channels;
}

export function getInboxLimitsFromPlan(
  plan: SubscriptionPlan | null,
  subscriptionActive: boolean,
  primaryChannel?: InboxChannel | null,
): InboxLimits {
  const features = plan?.features ?? {};
  const staffInbox = planHasBooleanFeature(plan, "staff_inbox", subscriptionActive);

  return {
    staffInbox,
    monthlyCap: planFeatureNumber(plan, "inbox_monthly_message_cap", subscriptionActive),
    maxChannels: planFeatureNumber(plan, "inbox_max_channels", subscriptionActive),
    overageRateGbp: planFeatureNumber(plan, "inbox_overage_rate_gbp", subscriptionActive),
    allowedChannels: staffInbox ? getAllowedInboxChannels(features, primaryChannel) : [],
    contactLinksOnly: subscriptionActive && !staffInbox,
  };
}

export function isInboxChannelAllowed(
  limits: InboxLimits,
  channel: InboxChannel,
  primaryChannel?: InboxChannel | null,
): boolean {
  if (!limits.staffInbox) return false;
  if (limits.maxChannels === 1 && channel !== "email") {
    return primaryChannel === channel;
  }
  return limits.allowedChannels.includes(channel);
}

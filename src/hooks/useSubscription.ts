import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "paused";

export type PlanFeatures = {
  schedule?: boolean;
  clients?: boolean;
  consent?: boolean;
  customer_portal?: boolean;
  reminders?: boolean;
  stripe_deposits?: boolean;
  invoicing?: boolean;
  staff_inbox?: boolean;
  support_tickets?: boolean;
  inbox_email?: boolean;
  inbox_whatsapp?: boolean;
  inbox_instagram?: boolean;
  inbox_facebook?: boolean;
  inbox_sms?: boolean;
  inbox_max_channels?: number;
  inbox_monthly_message_cap?: number;
  inbox_overage_rate_gbp?: number;
  stock?: boolean;
  billing?: boolean;
  stencil?: boolean;
  dashboard?: boolean;
  aftercare?: boolean;
  sla?: boolean;
  migration?: boolean;
};

export type SubscriptionPlan = {
  id: string;
  name: string;
  description: string | null;
  price_gbp_monthly: number | null;
  max_artist_seats: number | null;
  trial_days: number;
  features: PlanFeatures;
};

export type OrganizationSubscription = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  memberRole: "owner" | "admin" | "member" | null;
  subscription: {
    id: string;
    planId: string;
    status: SubscriptionStatus;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    trialEnd: string | null;
  } | null;
  plan: SubscriptionPlan | null;
};

const ACTIVE_STATUSES: SubscriptionStatus[] = ["trialing", "active", "past_due"];

export function isSubscriptionActive(status: SubscriptionStatus | null | undefined): boolean {
  return !!status && ACTIVE_STATUSES.includes(status);
}

export function planHasFeature(
  plan: SubscriptionPlan | null,
  feature: keyof PlanFeatures,
  subscriptionActive = false,
): boolean {
  if (!subscriptionActive || !plan?.features) return false;
  const value = plan.features[feature];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  return false;
}

export function planFeatureNumber(
  plan: SubscriptionPlan | null,
  feature: keyof PlanFeatures,
  subscriptionActive = false,
): number {
  if (!subscriptionActive || !plan?.features) return 0;
  const value = plan.features[feature];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

type SubscriptionRpcPayload = {
  organizationId?: string;
  organizationName?: string;
  organizationSlug?: string;
  memberRole?: OrganizationSubscription["memberRole"];
  subscription?: {
    id: string;
    planId: string;
    status: SubscriptionStatus;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    trialEnd: string | null;
  } | null;
  plan?: SubscriptionPlan | null;
};

async function fetchOrganizationSubscription(userId: string): Promise<OrganizationSubscription | null> {
  const { data, error } = await supabase.rpc("get_organization_subscription_for_user", {
    _user_id: userId,
  });

  if (error || !data || typeof data !== "object") return null;

  const row = data as SubscriptionRpcPayload;
  if (!row.organizationId || !row.organizationName || !row.organizationSlug) return null;

  const plan = row.plan
    ? {
        ...row.plan,
        features: (row.plan.features as PlanFeatures) ?? {},
      }
    : null;

  return {
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    organizationSlug: row.organizationSlug,
    memberRole: row.memberRole ?? null,
    subscription: row.subscription ?? null,
    plan,
  };
}

export type SeatUsage = {
  used: number;
  max: number | null;
  canAdd: boolean;
  planId: string | null;
};

async function fetchSeatUsage(userId: string): Promise<SeatUsage> {
  const { data, error } = await supabase.rpc("get_org_seat_usage", { _user_id: userId });
  if (error || !data) {
    return { used: 0, max: null, canAdd: true, planId: null };
  }
  const row = data as { used?: number; max?: number | null; can_add?: boolean; plan_id?: string | null };
  return {
    used: row.used ?? 0,
    max: row.max ?? null,
    canAdd: row.can_add !== false,
    planId: row.plan_id ?? null,
  };
}

export function useArtistSeats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["artist-seat-usage", user?.id],
    queryFn: () => (user ? fetchSeatUsage(user.id) : null),
    enabled: !!user,
    staleTime: 30_000,
  });
}

export function useSubscription() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["organization-subscription", user?.id],
    queryFn: () => (user ? fetchOrganizationSubscription(user.id) : null),
    enabled: !!user,
    staleTime: 60_000,
  });

  const seatQuery = useArtistSeats();
  const isActive =
    isSubscriptionActive(query.data?.subscription?.status) || !!seatQuery.data?.planId;
  const hasFeature = (feature: keyof PlanFeatures) =>
    planHasFeature(query.data?.plan ?? null, feature, isActive);
  const canManageBilling = query.data?.memberRole === "owner" || query.data?.memberRole === "admin";

  return {
    ...query,
    isActive,
    hasFeature,
    canManageBilling,
  };
}

export function usePublicPlans() {
  return useQuery({
    queryKey: ["subscription-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("id, name, description, price_gbp_monthly, max_artist_seats, trial_days, features, sort_order")
        .eq("is_active", true)
        .eq("is_self_serve", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map((p) => ({
        ...p,
        features: (p.features as PlanFeatures) ?? {},
      })) as SubscriptionPlan[];
    },
    staleTime: 300_000,
  });
}

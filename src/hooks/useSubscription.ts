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

export function planHasFeature(plan: SubscriptionPlan | null, feature: keyof PlanFeatures): boolean {
  if (!plan?.features) return false;
  return plan.features[feature] === true;
}

async function fetchOrganizationSubscription(userId: string): Promise<OrganizationSubscription | null> {
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(id, name, slug)")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership?.organizations) return null;

  const org = membership.organizations as { id: string; name: string; slug: string };

  const { data: subRow } = await supabase
    .from("platform_subscriptions")
    .select("id, plan_id, status, current_period_end, cancel_at_period_end, trial_end")
    .eq("organization_id", org.id)
    .maybeSingle();

  let plan: SubscriptionPlan | null = null;
  if (subRow?.plan_id) {
    const { data: planRow } = await supabase
      .from("subscription_plans")
      .select("id, name, description, price_gbp_monthly, max_artist_seats, trial_days, features")
      .eq("id", subRow.plan_id)
      .maybeSingle();
    if (planRow) {
      plan = {
        ...planRow,
        features: (planRow.features as PlanFeatures) ?? {},
      };
    }
  }

  return {
    organizationId: org.id,
    organizationName: org.name,
    organizationSlug: org.slug,
    memberRole: membership.role as OrganizationSubscription["memberRole"],
    subscription: subRow
      ? {
          id: subRow.id,
          planId: subRow.plan_id,
          status: subRow.status as SubscriptionStatus,
          currentPeriodEnd: subRow.current_period_end,
          cancelAtPeriodEnd: subRow.cancel_at_period_end,
          trialEnd: subRow.trial_end,
        }
      : null,
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

  const isActive = isSubscriptionActive(query.data?.subscription?.status);
  const hasFeature = (feature: keyof PlanFeatures) => planHasFeature(query.data?.plan ?? null, feature);
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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";

import { fetchIsPlatformAdmin } from "@/lib/platformAdmin";

export type PlatformOverview = {
  totalStudios: number;
  activeSubscriptions: number;
  trialing: number;
  canceled: number;
  pastDue: number;
  noSubscription: number;
  totalUsers: number;
  customers: number;
  artists: number;
  studioAdmins: number;
};

export type PlatformStudio = {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  ownerUserId: string | null;
  ownerEmail: string | null;
  shopName: string | null;
  planId: string | null;
  planName: string | null;
  subscriptionStatus: string | null;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string | null;
  isGratuity?: boolean;
  memberCount: number;
  artistSeats: number;
};

export type PlatformUser = {
  userId: string;
  displayName: string;
  email: string;
  createdAt: string;
  roles: string[];
  organizationName: string | null;
  subscriptionStatus: string | null;
  planId: string | null;
};

export type PlatformEvent = {
  id: string;
  organizationId: string | null;
  organizationName: string | null;
  eventType: string;
  processedAt: string;
  payload: Record<string, unknown>;
};

async function fetchOverview(): Promise<PlatformOverview> {
  const { data, error } = await supabase.rpc("platform_admin_overview");
  if (error) throw error;
  return data as PlatformOverview;
}

async function fetchStudios(): Promise<PlatformStudio[]> {
  const { data, error } = await supabase.rpc("platform_admin_list_studios");
  if (error) throw error;
  return (data ?? []) as PlatformStudio[];
}

async function fetchUsers(search: string, role: string | null): Promise<PlatformUser[]> {
  const { data, error } = await supabase.rpc("platform_admin_list_users", {
    _search: search || null,
    _role: role || null,
  });
  if (error) throw error;
  return (data ?? []) as PlatformUser[];
}

async function fetchEvents(): Promise<PlatformEvent[]> {
  const { data, error } = await supabase.rpc("platform_admin_recent_events", { _limit: 50 });
  if (error) throw error;
  return (data ?? []) as PlatformEvent[];
}

export function usePlatformAdminAccess() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["platform-admin-access", user?.id],
    queryFn: () => fetchIsPlatformAdmin(user!.id),
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function usePlatformOverview(enabled: boolean) {
  return useQuery({
    queryKey: ["platform-admin-overview"],
    queryFn: fetchOverview,
    enabled,
    staleTime: 30_000,
  });
}

export function usePlatformStudios(enabled: boolean) {
  return useQuery({
    queryKey: ["platform-admin-studios"],
    queryFn: fetchStudios,
    enabled,
    staleTime: 30_000,
  });
}

export function usePlatformUsers(enabled: boolean, search: string, role: string | null) {
  return useQuery({
    queryKey: ["platform-admin-users", search, role],
    queryFn: () => fetchUsers(search, role),
    enabled,
    staleTime: 30_000,
  });
}

export function usePlatformEvents(enabled: boolean) {
  return useQuery({
    queryKey: ["platform-admin-events"],
    queryFn: fetchEvents,
    enabled,
    staleTime: 30_000,
  });
}

export function useGrantPlatformSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      organizationId: string;
      planId: string;
      months: number;
      note?: string;
      cancelStripe?: boolean;
    }) => {
      const { data, error } = await invokeEdgeFunctionJson<{
        ok?: boolean;
        error?: string;
        warning?: string;
        stripeCanceled?: boolean;
        isGratuity?: boolean;
        currentPeriodEnd?: string;
      }>("platform-admin-grant-gratuity", {
        organizationId: args.organizationId,
        planId: args.planId,
        months: args.months,
        note: args.note ?? null,
        cancelStripe: args.cancelStripe !== false,
      });
      if (error) throw error;
      if (!data.ok) throw new Error(data.error || "Gratuity grant failed");
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-admin-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-admin-studios"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-admin-users"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-admin-events"] });
    },
  });
}

export function useRevokePlatformSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { organizationId: string; note?: string }) => {
      const { data, error } = await invokeEdgeFunctionJson<{
        ok?: boolean;
        error?: string;
        warning?: string;
        stripeCanceled?: boolean;
      }>("platform-admin-revoke-subscription", {
        organizationId: args.organizationId,
        note: args.note ?? null,
      });
      if (error) throw error;
      if (!data.ok) throw new Error(data.error || "Revoke failed");
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-admin-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-admin-studios"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-admin-users"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-admin-events"] });
    },
  });
}

export function useSetPlatformSubscriptionStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { organizationId: string; status: string }) => {
      const { data, error } = await supabase.rpc("platform_admin_set_subscription_status", {
        _org_id: args.organizationId,
        _status: args.status,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-admin-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-admin-studios"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-admin-events"] });
    },
  });
}

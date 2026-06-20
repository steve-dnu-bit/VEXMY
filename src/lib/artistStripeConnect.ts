import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";

export type ArtistStripeConnectStatus = {
  ok?: boolean;
  organizationId?: string;
  shopReady?: boolean;
  shopName?: string | null;
  accountId: string | null;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboardedAt: string | null;
  ready: boolean;
  artistSplitPercent: number | null;
  shopSplitPercent: number | null;
  error?: string;
  code?: string;
};

export async function fetchArtistStripeConnectStatus(): Promise<ArtistStripeConnectStatus> {
  const { data, error } = await invokeEdgeFunctionJson<ArtistStripeConnectStatus>("artist-connect-onboarding", {
    action: "status",
  });
  if (error) throw new Error(error.message);
  if (data.error) throw new Error(data.error);
  return data;
}

export async function startArtistStripeConnectOnboarding(paths?: {
  returnPath?: string;
  refreshPath?: string;
}): Promise<string> {
  const { data, error } = await invokeEdgeFunctionJson<{ onboardingUrl?: string; error?: string; code?: string }>(
    "artist-connect-onboarding",
    {
      action: "onboard",
      returnPath: paths?.returnPath,
      refreshPath: paths?.refreshPath,
    },
  );
  if (error || !data.onboardingUrl) {
    throw new Error(data.error || error?.message || "Could not start payout setup");
  }
  return data.onboardingUrl;
}

export async function openArtistStripeConnectDashboard(): Promise<string> {
  const { data, error } = await invokeEdgeFunctionJson<{ dashboardUrl?: string; error?: string }>(
    "artist-connect-onboarding",
    { action: "dashboard" },
  );
  if (error || !data.dashboardUrl) {
    throw new Error(data.error || error?.message || "Could not open payout dashboard");
  }
  return data.dashboardUrl;
}

import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";

export type StripeConnectBusinessType = "individual" | "company";

export type StripeConnectStatus = {
  ok?: boolean;
  organizationId?: string;
  planId?: string | null;
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboardedAt: string | null;
  ready: boolean;
  businessType?: StripeConnectBusinessType | null;
  requiresBusinessTypeChoice?: boolean;
  error?: string;
};

export async function fetchStripeConnectStatus(): Promise<StripeConnectStatus> {
  const { data, error } = await invokeEdgeFunctionJson<StripeConnectStatus>("stripe-connect-onboarding", {
    action: "status",
  });
  if (error) throw new Error(error.message);
  if (data.error) throw new Error(data.error);
  return data;
}

export async function startStripeConnectOnboarding(paths?: {
  returnPath?: string;
  refreshPath?: string;
  businessType?: StripeConnectBusinessType;
}): Promise<string> {
  const { data, error } = await invokeEdgeFunctionJson<{ onboardingUrl?: string; error?: string }>(
    "stripe-connect-onboarding",
    {
      action: "onboard",
      returnPath: paths?.returnPath,
      refreshPath: paths?.refreshPath,
      businessType: paths?.businessType,
    },
  );
  if (error || !data.onboardingUrl) {
    throw new Error(data.error || error?.message || "Could not start payout setup");
  }
  return data.onboardingUrl;
}

export async function openStripeConnectDashboard(): Promise<string> {
  const { data, error } = await invokeEdgeFunctionJson<{ dashboardUrl?: string; error?: string }>(
    "stripe-connect-onboarding",
    { action: "dashboard" },
  );
  if (error || !data.dashboardUrl) {
    throw new Error(data.error || error?.message || "Could not open payout dashboard");
  }
  return data.dashboardUrl;
}

import { supabase } from "@/integrations/supabase/client";

/** Customer role users who have not completed invited onboarding. */
export async function needsCustomerProfileSetup(userId: string): Promise<boolean> {
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "customer")
    .limit(1);

  if (!roleRows?.length) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("customer_profile_completed")
    .eq("user_id", userId)
    .maybeSingle();

  return profile ? !profile.customer_profile_completed : true;
}


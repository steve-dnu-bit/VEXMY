import { supabase } from "@/integrations/supabase/client";
import {
  authIntentFromSearchParams,
  peekAuthIntent,
  popAuthIntent,
  stashAuthIntent,
  type AuthIntent,
} from "@/lib/authIntent";

export async function applyAuthProvisioning(intent: AuthIntent | null): Promise<void> {
  if (!intent) return;

  const { error } = await supabase.rpc("apply_oauth_provisioning", {
    _intent: intent.type,
    _organization_id: intent.organizationId ?? undefined,
    _invite_token: intent.inviteToken ?? undefined,
  });

  if (error) {
    console.warn("[auth] apply_oauth_provisioning:", error.message);
    throw error;
  }
}

/** Merge URL intent params with sessionStorage, provision, then clear stash. */
export async function completeAuthProvisioningFromContext(
  searchParams?: URLSearchParams | null,
): Promise<void> {
  const fromUrl = searchParams ? authIntentFromSearchParams(searchParams) : null;
  if (fromUrl) stashAuthIntent(fromUrl);

  const intent = peekAuthIntent();
  if (!intent) return;

  await applyAuthProvisioning(intent);
  popAuthIntent();
}

/** Run once after OAuth/password sign-in when a stashed intent exists. */
export async function completeStashedAuthProvisioning(): Promise<void> {
  await completeAuthProvisioningFromContext(null);
}

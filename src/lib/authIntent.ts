const STORAGE_KEY = "velbok-oauth-intent";

export type AuthIntentType = "staff" | "studio_subscribe" | "customer" | "invite";

export type AuthIntent = {
  type: AuthIntentType;
  organizationId?: string | null;
  inviteToken?: string | null;
  next?: string | null;
  planId?: string | null;
};

export function stashAuthIntent(intent: AuthIntent): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent));
  } catch {
    /* private mode / iframe */
  }
}

export function peekAuthIntent(): AuthIntent | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthIntent;
  } catch {
    return null;
  }
}

export function popAuthIntent(): AuthIntent | null {
  const intent = peekAuthIntent();
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return intent;
}

export function authIntentFromSearchParams(params: URLSearchParams): AuthIntent | null {
  const intent = params.get("auth_intent")?.trim().toLowerCase();
  if (!intent) return null;

  const type =
    intent === "customer" || intent === "staff" || intent === "studio_subscribe" || intent === "invite"
      ? (intent as AuthIntentType)
      : null;
  if (!type) return null;

  return {
    type,
    organizationId: params.get("org")?.trim() || params.get("organization_id")?.trim() || null,
    inviteToken: params.get("invite")?.trim() || params.get("intent")?.trim() || null,
    next: params.get("next")?.trim() || null,
  };
}

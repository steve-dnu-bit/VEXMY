import { supabase } from "@/integrations/supabase/client";

/**
 * Helpers for Edge Function invocations that should survive stale/expired auth
 * sessions by refreshing once and retrying.
 */
export async function getFreshAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;
  const { data, error } = await supabase.auth.refreshSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}

function messageFromPayload(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const err = (data as { error?: unknown }).error;
  return typeof err === "string" && err.trim() ? err : null;
}

async function extractFunctionError(data: unknown, err: unknown, fallback: string): Promise<Error> {
  const payloadMessage = messageFromPayload(data);
  if (payloadMessage) return new Error(payloadMessage);

  if (err && typeof err === "object") {
    const fnErr = err as { message?: string; context?: Response };
    const response = fnErr.context;

    if (response && typeof response.clone === "function") {
      try {
        const body = await response.clone().json();
        const msg = messageFromPayload(body);
        if (msg) return new Error(msg);
      } catch {
        try {
          const text = (await response.clone().text()).trim();
          if (text) {
            try {
              const parsed = JSON.parse(text) as { error?: unknown };
              const msg = messageFromPayload(parsed);
              if (msg) return new Error(msg);
            } catch {
              if (!/non-2xx/i.test(text)) return new Error(text.slice(0, 400));
            }
          }
        } catch {
          /* ignore */
        }
      }
    }

    if (fnErr.message && !/non-2xx/i.test(fnErr.message)) {
      return new Error(fnErr.message);
    }
  }

  return new Error(fallback);
}

/** Public Edge Functions (no login required) — e.g. marketing contact form. */
export async function invokePublicEdgeFunctionJson<T = unknown>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<{ data: T; error: Error | null }> {
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  const payload = (data ?? ({} as T)) as T;
  const payloadMessage = messageFromPayload(payload);
  if (!error && !payloadMessage) return { data: payload, error: null };
  if (!error && payloadMessage) return { data: payload, error: new Error(payloadMessage) };
  return { data: payload, error: await extractFunctionError(payload, error, "Request failed") };
}

export async function invokeEdgeFunctionJson<T = unknown>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<{ data: T; error: Error | null }> {
  const invokeOnce = async (accessToken: string | null) => {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });
    return { data: (data ?? ({} as T)) as T, error };
  };

  const firstToken = await getFreshAccessToken();
  if (!firstToken) {
    return { data: {} as T, error: new Error("Session expired. Please sign in again.") };
  }

  let first = await invokeOnce(firstToken);
  const firstPayloadError = messageFromPayload(first.data);
  if (!first.error && !firstPayloadError) return { data: first.data, error: null };
  if (!first.error && firstPayloadError) return { data: first.data, error: new Error(firstPayloadError) };

  const status = (first.error as { context?: { status?: number } })?.context?.status;
  if (status !== 401) {
    return { data: first.data, error: await extractFunctionError(first.data, first.error, "Request failed") };
  }

  await supabase.auth.refreshSession();
  const secondToken = await getFreshAccessToken();
  if (!secondToken) {
    return { data: first.data, error: new Error("Session expired. Please sign in again.") };
  }

  const second = await invokeOnce(secondToken);
  const secondPayloadError = messageFromPayload(second.data);
  if (!second.error && !secondPayloadError) return { data: second.data, error: null };
  if (!second.error && secondPayloadError) return { data: second.data, error: new Error(secondPayloadError) };

  return {
    data: second.data,
    error: await extractFunctionError(second.data, second.error, "Session expired. Please sign in again."),
  };
}

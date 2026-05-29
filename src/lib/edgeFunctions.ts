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

  const parseError = (err: unknown, fallback: string): Error => {
    if (!err) return new Error(fallback);

    // Supabase FunctionHttpError often carries HTTP details in `context`.
    const maybe = err as { message?: string; context?: { status?: number; json?: () => Promise<unknown> } };
    return new Error(maybe.message || fallback);
  };

  const firstToken = await getFreshAccessToken();
  if (!firstToken) {
    return { data: {} as T, error: new Error("Session expired. Please sign in again.") };
  }

  let first = await invokeOnce(firstToken);
  if (!first.error) return { data: first.data, error: null };

  const status = (first.error as { context?: { status?: number } })?.context?.status;
  if (status !== 401) {
    return { data: first.data, error: parseError(first.error, "Request failed") };
  }

  await supabase.auth.refreshSession();
  const secondToken = await getFreshAccessToken();
  if (!secondToken) {
    return { data: first.data, error: new Error("Session expired. Please sign in again.") };
  }

  const second = await invokeOnce(secondToken);
  if (!second.error) return { data: second.data, error: null };

  return { data: second.data, error: parseError(second.error, "Session expired. Please sign in again.") };
}

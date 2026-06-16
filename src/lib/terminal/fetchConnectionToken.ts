import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";

export async function fetchTerminalConnectionToken(): Promise<string> {
  const { data, error } = await invokeEdgeFunctionJson<{ secret?: string }>("stripe-terminal-pos", {
    action: "connection_token",
  });
  if (error || !data.secret) {
    throw new Error(error?.message || "Could not get connection token");
  }
  return data.secret;
}

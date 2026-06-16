import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";

export async function fetchTerminalConfig(): Promise<{ isTest: boolean }> {
  const { data, error } = await invokeEdgeFunctionJson<{ isTest?: boolean }>("stripe-terminal-pos", {
    action: "terminal_config",
  });
  if (error) {
    throw new Error(error.message || "Could not load Terminal configuration");
  }
  return { isTest: !!data.isTest };
}

import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import { setCachedTerminalLocationId } from "@/lib/terminal/terminalLocationCache";

export async function ensureTerminalLocation(options?: { forceRecreate?: boolean }): Promise<string> {
  const { data, error } = await invokeEdgeFunctionJson<{ locationId?: string }>("stripe-terminal-pos", {
    action: "ensure_location",
    forceRecreate: options?.forceRecreate === true,
  });
  if (error || !data.locationId) {
    throw new Error(error?.message || "Could not set up Terminal location");
  }
  setCachedTerminalLocationId(data.locationId);
  return data.locationId;
}

/** Whether Stripe has reached CONNECTED at least once this app session (ignores startup NOT_CONNECTED). */
let terminalHasBeenConnected = false;

export function markTerminalConnectionEstablished(): void {
  terminalHasBeenConnected = true;
}

export function clearTerminalConnectionEstablished(): void {
  terminalHasBeenConnected = false;
}

export function hasTerminalConnectionBeenEstablished(): boolean {
  return terminalHasBeenConnected;
}

export function isStripeConnectedStatus(status: string): boolean {
  const normalized = status.trim().toUpperCase();
  return normalized === "CONNECTED" || normalized.endsWith(".CONNECTED");
}

export function isStripeConnectingStatus(status: string): boolean {
  const normalized = status.trim().toUpperCase();
  return normalized.includes("CONNECTING");
}

export function isStripeNotConnectedStatus(status: string): boolean {
  const normalized = status.trim().toUpperCase();
  return normalized === "NOT_CONNECTED" || normalized.endsWith(".NOT_CONNECTED");
}

export function isStripeDiscoveringStatus(status: string): boolean {
  const normalized = status.trim().toUpperCase();
  return normalized.includes("DISCOVERING");
}

/** Staff-friendly copy — hide the normal pre-connect NOT_CONNECTED state. */
export function formatConnectionStatusForStaff(status: string): string | null {
  const normalized = status.trim().toUpperCase();
  if (isStripeNotConnectedStatus(normalized)) {
    return terminalHasBeenConnected ? "Tap to Pay disconnected — tap Enable Tap to Pay again." : null;
  }
  if (isStripeDiscoveringStatus(normalized)) {
    return "Looking for Tap to Pay on this phone… keep Velbok open (up to 1 minute).";
  }
  if (isStripeConnectingStatus(normalized)) {
    return "Connecting Tap to Pay… keep Velbok open in the foreground.";
  }
  if (isStripeConnectedStatus(normalized)) {
    return "Tap to Pay ready.";
  }
  return null;
}

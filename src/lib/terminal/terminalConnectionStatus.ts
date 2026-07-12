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
  const normalized = status.trim().toUpperCase().replace(/^.*\./, "");
  return normalized === "CONNECTED";
}

export function isStripeConnectingStatus(status: string): boolean {
  const normalized = status.trim().toUpperCase();
  return normalized.includes("CONNECTING") && !normalized.includes("NOT");
}

export function isStripeNotConnectedStatus(status: string): boolean {
  const normalized = status.trim().toUpperCase().replace(/^.*\./, "");
  return normalized === "NOT_CONNECTED" || normalized === "NOTCONNECTED";
}

export function isStripeDiscoveringStatus(status: string): boolean {
  const normalized = status.trim().toUpperCase();
  return normalized.includes("DISCOVERING");
}

export function isStripeReconnectingStatus(status: string): boolean {
  const normalized = status.trim().toUpperCase();
  return normalized.includes("RECONNECTING");
}

/** Staff-friendly copy — hide the normal pre-connect NOT_CONNECTED state. */
export function formatConnectionStatusForStaff(
  status: string,
  readerMode: "tap_to_pay" | "bluetooth" = "tap_to_pay",
): string | null {
  const wisePad = readerMode === "bluetooth";
  if (isStripeNotConnectedStatus(status)) {
    return terminalHasBeenConnected
      ? wisePad
        ? "WisePad disconnected — tap Connect reader again."
        : "Tap to Pay disconnected — tap Enable Tap to Pay again."
      : null;
  }
  if (isStripeDiscoveringStatus(status)) {
    return wisePad
      ? "Looking for WisePad… keep Bluetooth on and the reader nearby."
      : "Looking for Tap to Pay on this phone… keep Velbok open (up to 1 minute).";
  }
  if (isStripeReconnectingStatus(status)) {
    return wisePad
      ? "Reconnecting to WisePad… keep the reader nearby."
      : "Reconnecting Tap to Pay…";
  }
  if (isStripeConnectingStatus(status)) {
    return wisePad
      ? "Connecting to WisePad… keep Velbok open."
      : "Connecting Tap to Pay… keep Velbok open in the foreground.";
  }
  if (isStripeConnectedStatus(status)) {
    return wisePad ? "WisePad connected." : "Tap to Pay ready.";
  }
  return null;
}

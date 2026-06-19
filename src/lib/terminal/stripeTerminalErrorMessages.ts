/**
 * User-facing messages for Stripe Terminal error codes.
 * @see https://stripe.dev/stripe-terminal-android/external/com.stripe.stripeterminal.external.models/-terminal-error-code/
 */
const STRIPE_TERMINAL_ERROR_MESSAGES: Record<string, string> = {
  TAP_TO_PAY_UNSUPPORTED_DEVICE:
    "This phone is not supported for Tap to Pay (NFC, security hardware, or device model). Try a Pixel/Samsung S22+ or use a WisePad reader.",
  TAP_TO_PAY_DEBUG_NOT_SUPPORTED:
    "Velbok is running as a debuggable app build. Uninstall Velbok completely and install velbok-release.apk (not a debug APK). Developer options on the phone are not the cause of this specific error.",
  TAP_TO_PAY_DEBUGGING_UNSUPPORTED:
    "Tap to Pay blocked because the app or device is in a debug/development state. Install velbok-release.apk only. If you already did, contact support with the error code below.",
  TAP_TO_PAY_INSECURE_ENVIRONMENT:
    "Stripe blocked Tap to Pay for security (not a Velbok bug). Close screen recording, turn off Developer options and USB debugging, restart the phone, then try again.",
  TAP_TO_PAY_LIBRARY_NOT_INCLUDED:
    "Tap to Pay SDK is missing from this app build. Reinstall the latest Velbok release.",
  TAP_TO_PAY_UNSUPPORTED_ANDROID_VERSION:
    "Android 13 or later is required for Tap to Pay on this phone.",
  ATTESTATION_FAILURE:
    "Google device security check failed. Update Google Play Services, use stock Android (not rooted), and install Velbok from velbok-release.apk.",
  INTEGRATION_ERROR:
    "Tap to Pay setup failed. Allow Location, check internet, and finish Stripe Connect + Terminal location in Admin → POS.",
  CONNECTION_TOKEN_PROVIDER_ERROR:
    "Could not get a Terminal connection token. Check internet, sign in again, and confirm Stripe Connect + Terminal location in Admin → POS.",
  READER_CONNECTION_FAILED:
    "Could not connect Tap to Pay on this phone. Keep Velbok in the foreground and try mobile data.",
  NOT_CONNECTED_TO_READER:
    "Phone payments are not connected. Tap Enable phone payments, wait until connected, then try again.",
};

function normalizeStripeErrorCode(raw: string): string {
  return raw
    .replace(/^INTEGRATION_ERROR\./i, "")
    .replace(/^READER_ERROR\./i, "")
    .replace(/^API_ERROR\./i, "")
    .trim()
    .toUpperCase();
}

function extractStripeErrorCode(text: string): string | null {
  const codeMatch = text.match(
    /(?:error\s*code[:\s]*)?((?:INTEGRATION_ERROR|READER_ERROR|API_ERROR)\.)?([A-Z][A-Z0-9_]+)/i,
  );
  if (!codeMatch?.[2]) return null;
  return normalizeStripeErrorCode(codeMatch[2]);
}

/** Turn Stripe Terminal native / API error text into actionable copy for staff. */
export function formatStripeTerminalErrorMessage(raw: string): string {
  const text = raw.trim();
  if (!text) return "Tap to Pay failed. Try again or contact support.";

  const code = extractStripeErrorCode(text);
  if (code) {
    const mapped = STRIPE_TERMINAL_ERROR_MESSAGES[code];
    if (mapped) return `${mapped}\n\nStripe: ${code}`;
  }

  // Our native patch when discovery finds no Tap to Pay reader on device.
  if (/not available on this device/i.test(text)) {
    return `${text}\n\nThis is Stripe/device support — not a debug APK issue. Try a supported phone or WisePad Bluetooth mode.`;
  }

  if (/do not pending fetchConnectionToken|timed out waiting for connection token/i.test(text)) {
    return "Terminal connection token timed out. Force-close Velbok, reopen, check internet, then try again.";
  }
  if (/device does not have nfc|nfc/i.test(text) && /unsupported/i.test(text)) {
    return "NFC is not available for Tap to Pay on this device.";
  }
  if (/not connected|NOT_CONNECTED_TO_READER/i.test(text)) {
    return STRIPE_TERMINAL_ERROR_MESSAGES.NOT_CONNECTED_TO_READER;
  }

  return text;
}

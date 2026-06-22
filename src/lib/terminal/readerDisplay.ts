import { StripeTerminal } from "@capacitor-community/stripe-terminal";
import { isNativeApp } from "@/lib/platform";

export type ReaderDisplayCart = {
  currency: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  lineItems: Array<{ name: string; quantity: number; unitPrice: number }>;
};

const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

function toMinor(amountMajor: number, currency: string): number {
  const cur = currency.toLowerCase();
  return ZERO_DECIMAL.has(cur) ? Math.round(amountMajor) : Math.round(amountMajor * 100);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Some WisePad firmware/models reject setReaderDisplay — payment still works without it. */
export function isUnsupportedReaderDisplayError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /does not support setting display/i.test(message) || /unsupported.*display/i.test(message);
}

/** Stripe requires total = sum(qty * unit amount) + tax (all in minor units). */
export function buildReaderDisplayCart(input: {
  currency: string;
  chargeAmount: number;
  lineItems: Array<{ name: string; quantity: number; unitPrice: number }>;
}): ReaderDisplayCart | null {
  const total = Math.round(input.chargeAmount * 100) / 100;
  if (total <= 0) return null;

  const label =
    input.lineItems.length === 1
      ? input.lineItems[0].name
      : input.lineItems.length > 1
        ? `Total (${input.lineItems.length} items)`
        : "Amount due";

  return {
    currency: input.currency,
    subtotal: total,
    taxAmount: 0,
    total,
    lineItems: [{ name: label.slice(0, 40), quantity: 1, unitPrice: total }],
  };
}

type StripeDisplayPayload = {
  currency: string;
  tax: number;
  total: number;
  lineItems: Array<{ displayName: string; quantity: number; amount: number }>;
};

function toStripeDisplayPayload(cart: ReaderDisplayCart): StripeDisplayPayload {
  const currency = cart.currency.toLowerCase();
  const totalMinor = toMinor(cart.total, currency);
  const firstLine = cart.lineItems[0];

  return {
    currency,
    tax: 0,
    total: totalMinor,
    lineItems: [
      {
        displayName: (firstLine?.name ?? "Amount due").slice(0, 40),
        quantity: 1,
        amount: totalMinor,
      },
    ],
  };
}

async function setDisplayWithRetry(payload: StripeDisplayPayload, attempts = 3): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await StripeTerminal.setReaderDisplay(payload);
      return;
    } catch (error) {
      if (isUnsupportedReaderDisplayError(error)) return;
      lastError = error;
      if (attempt < attempts - 1) {
        await sleep(350 * (attempt + 1));
      }
    }
  }
  if (lastError && isUnsupportedReaderDisplayError(lastError)) return;
  throw lastError instanceof Error ? lastError : new Error("Could not update reader display");
}

export async function updateNativeReaderDisplay(cart: ReaderDisplayCart): Promise<void> {
  if (!isNativeApp()) return;
  if (cart.total <= 0) {
    await StripeTerminal.clearReaderDisplay().catch(() => undefined);
    return;
  }

  await setDisplayWithRetry(toStripeDisplayPayload(cart));
}

export async function clearNativeReaderDisplay(): Promise<void> {
  if (!isNativeApp()) return;
  await StripeTerminal.clearReaderDisplay().catch(() => undefined);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha1Base64(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const bytes = new Uint8Array(sig);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Meta (Facebook/Instagram) X-Hub-Signature-256 verification. */
export async function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) return false;
  const expected = signatureHeader.slice("sha256=".length);
  const actual = await hmacSha256Hex(appSecret, rawBody);
  return timingSafeEqual(actual, expected);
}

/** Twilio X-Twilio-Signature validation for form POST webhooks. */
export async function verifyTwilioWebhookSignature(
  authToken: string,
  signatureHeader: string | null,
  webhookUrl: string,
  params: Record<string, string>,
): Promise<boolean> {
  if (!authToken || !signatureHeader) return false;
  const sortedKeys = Object.keys(params).sort();
  let data = webhookUrl;
  for (const key of sortedKeys) data += key + params[key];
  const expected = await hmacSha1Base64(authToken, data);
  return timingSafeEqual(expected, signatureHeader);
}

import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

type FirebaseServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function loadServiceAccount(): FirebaseServiceAccount | null {
  const raw = (Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as FirebaseServiceAccount;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isFcmConfigured(): boolean {
  return loadServiceAccount() !== null;
}

async function getFcmAccessToken(account: FirebaseServiceAccount): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60_000) {
    return cachedAccessToken.token;
  }

  const pem = account.private_key.replace(/\\n/g, "\n");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const jwt = await create(
    { alg: "RS256", typ: "JWT" },
    {
      iss: account.client_email,
      sub: account.client_email,
      aud: "https://oauth2.googleapis.com/token",
      iat: getNumericDate(0),
      exp: getNumericDate(3600),
      scope: "https://www.googleapis.com/auth/firebase.messaging",
    },
    key,
  );

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FCM OAuth failed: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("FCM OAuth missing access_token");

  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + (Number(data.expires_in ?? 3600) * 1000),
  };
  return data.access_token;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export type FcmPushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

export async function sendFcmToDeviceToken(
  deviceToken: string,
  payload: FcmPushPayload,
): Promise<{ ok: true } | { ok: false; invalidToken: boolean; error: string }> {
  const account = loadServiceAccount();
  if (!account) {
    return { ok: false, invalidToken: false, error: "fcm_not_configured" };
  }

  try {
    const accessToken = await getFcmAccessToken(account);
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: deviceToken,
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data: payload.data ?? {},
            android: {
              priority: "HIGH",
              notification: {
                channel_id: "velbok_default",
                sound: "default",
              },
            },
            apns: {
              payload: {
                aps: {
                  sound: "default",
                  badge: 1,
                },
              },
            },
          },
        }),
      },
    );

    if (res.ok) return { ok: true };

    const text = await res.text();
    const invalidToken =
      res.status === 404 ||
      text.includes("UNREGISTERED") ||
      text.includes("INVALID_ARGUMENT") ||
      text.includes("NOT_FOUND");

    return { ok: false, invalidToken, error: text.slice(0, 400) };
  } catch (e) {
    const message = e instanceof Error ? e.message : "fcm_send_failed";
    return { ok: false, invalidToken: false, error: message };
  }
}

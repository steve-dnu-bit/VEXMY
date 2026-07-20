// AI tattoo-stencil generator backed by Netlify AI Gateway.
//
// Converts an uploaded reference photo into a professional, transfer-ready
// black line-art stencil. Inference runs through Netlify AI Gateway (Gemini
// image model) and is billed to the site's Netlify credits — no third-party AI
// key required. Netlify injects GEMINI_API_KEY and GOOGLE_GEMINI_BASE_URL
// automatically at runtime.
//
// Two protections sit in front of the credit-spending call:
//   1. The caller must be a signed-in studio user (Supabase session check).
//   2. A per-account rolling 24-hour quota (Starter 3, Studio 6, Enterprise 10)
//      is claimed atomically before generation and refunded if the render fails.

// Image model used for generation. Any Gemini image model supported by AI
// Gateway can be swapped in here. "gemini-2.5-flash-image" is a cheaper, faster
// render (~$0.04 per image); "gemini-3-pro-image" gives the highest fidelity.
const STENCIL_MODEL = "gemini-2.5-flash-image";

// Shared art-direction every style inherits — guarantees a clean,
// transfer-ready result regardless of the chosen look.
const STENCIL_BASE = `Produce a tattoo stencil line drawing from this reference.

Hard requirements (all styles):
- Pure white (#FFFFFF) background only — no gray, texture, gradients, or photo artifacts
- Black (#000000) ink only — no color
- Same composition and framing as the input — do not crop, rotate, or add elements
- Preserve subject structure: faces, hair, hands, fabric folds, feathers as readable shapes
- High-resolution, vector-like, clean edges suitable for hectograph / thermal transfer paper`;

// Selectable stencil styles, each named after a tattoo artist whose signature
// look it evokes (the UI shows the artist name; the prompt drives the result).
// Each adds style-specific direction on top of the shared base. `valoonia` is
// the default and matches the original behaviour.
const STENCIL_STYLES: Record<string, { label: string; prompt: string }> = {
  valoonia: {
    label: "Stefan Dinu · signature line",
    prompt: `${STENCIL_BASE}

Style — signature pro transfer line-art:
- Smooth, continuous, intentional contours
- Remove all shading and tonal rendering; represent form with clean linework only
- Varying line weight: slightly bolder outer contours, finer interior detail lines
- No halftone, cross-hatching, or stipple unless a few essential mass lines`,
  },
  bold: {
    label: "Sailor Jerry · traditional",
    prompt: `${STENCIL_BASE}

Style — bold American/old-school traditional:
- Thick, confident, uniform outer outlines with strong interior linework
- Simplify fine detail into clean readable shapes
- No shading, hatching, or stippling — outline only
- Lines bold enough to read clearly when transferred and tattooed`,
  },
  fineline: {
    label: "Dr. Woo · fine line",
    prompt: `${STENCIL_BASE}

Style — fine line / single-needle:
- Thin, delicate, uniform-weight lines throughout
- Minimal, precise linework; keep only essential contours and key details
- Elegant and airy — avoid heavy or doubled lines
- No shading, fills, or hatching`,
  },
  sketch: {
    label: "Inez Janiak · sketch",
    prompt: `${STENCIL_BASE}

Style — illustrative sketch linework:
- Expressive, slightly sketchy contour lines with subtle weight variation
- A few light construction/gesture lines are acceptable where they aid the artist
- Convey form mainly through line; keep it clean enough to transfer
- No solid fills or photographic shading`,
  },
  dotwork: {
    label: "Chaim Machlev · dotwork",
    prompt: `${STENCIL_BASE}

Style — dotwork / stippling guide:
- Clean black outlines for all major contours
- Indicate shaded regions with stippling (dot density) rather than solid black or gray
- Denser dots for darker areas, sparser for lighter — no continuous-tone shading
- Keep dots crisp and well separated so they read on transfer paper`,
  },
  blackwork: {
    label: "Thomas Hooper · blackwork",
    prompt: `${STENCIL_BASE}

Style — blackwork:
- Strong black outlines plus solid black (#000000) fills for the darkest masses
- Everything is either pure white or pure black — no gray, no gradients
- Clear boundaries between filled and open areas
- Keep negative-space shapes deliberate and readable`,
  },
};

const DEFAULT_STYLE = "valoonia";

const CORS_ALLOW_ORIGINS = new Set([
  "https://velbok.com",
  "https://www.velbok.com",
  "https://localhost",
  "http://localhost",
  "capacitor://localhost",
  "ionic://localhost",
  "https://com.velbok.app",
]);

function isCapacitorOrigin(origin: string): boolean {
  return (
    origin.startsWith("capacitor://") ||
    origin.startsWith("ionic://") ||
    origin === "https://com.velbok.app" ||
    /^https?:\/\/localhost(?::\d+)?$/.test(origin)
  );
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allow =
    CORS_ALLOW_ORIGINS.has(origin) || isCapacitorOrigin(origin) ? origin : "https://velbok.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(req ? corsHeaders(req) : {}),
    },
  });
}

function supabaseEnv(): { url: string; anonKey: string; serviceKey: string | null } | null {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const anonKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";
  if (!url || !anonKey) return null;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
  return { url: url.replace(/\/$/, ""), anonKey, serviceKey: serviceKey || null };
}

/** Parse a data URL or raw base64 into { mimeType, base64 }. */
function parseImage(image: string): { mimeType: string; base64: string } | null {
  if (typeof image !== "string" || image.length === 0) return null;
  const match = image.match(/^data:([^;]+);base64,(.*)$/s);
  if (match) return { mimeType: match[1], base64: match[2] };
  // Assume a bare base64 JPEG if no data-URL prefix was supplied.
  return { mimeType: "image/jpeg", base64: image };
}

/** Pull the first generated image out of a Gemini generateContent response. */
type GeminiPart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
};

function extractStencil(data: any): string | null {
  const parts: GeminiPart[] = data?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline = part.inlineData ?? part.inline_data;
    const b64 = (inline as any)?.data;
    if (typeof b64 === "string" && b64.length > 0) {
      const mime =
        (inline as any)?.mimeType || (inline as any)?.mime_type || "image/png";
      return `data:${mime};base64,${b64}`;
    }
  }
  return null;
}

const STENCIL_CONTENT_BLOCKED_CODE = "STENCIL_CONTENT_BLOCKED";
const STENCIL_CONTENT_BLOCKED_MESSAGE =
  "This photo can’t be turned into a stencil because it looks copyrighted or protected (for example a branded character, logo, celebrity likeness, or published artwork). Try a photo you own or an original drawing instead.";

function explainStencilAiBlock(data: unknown, rawDetail = ""): string | null {
  const blob = `${typeof rawDetail === "string" ? rawDetail : ""} ${
    typeof data === "string" ? data : JSON.stringify(data ?? {})
  }`.toLowerCase();

  const promptBlock = (data as { promptFeedback?: { blockReason?: string } } | null)?.promptFeedback
    ?.blockReason;
  const finishReason = (data as { candidates?: { finishReason?: string }[] } | null)?.candidates?.[0]
    ?.finishReason;
  const reasons = [promptBlock, finishReason].filter(Boolean).join(" ").toUpperCase();

  const blockedReason =
    /IMAGE_SAFETY|PROHIBITED_CONTENT|BLOCKLIST|SAFETY|RECITATION|COPYRIGHT/.test(reasons) ||
    /image_safety|prohibited_content|blocklist|recitation|copyright|protected.?content|celebrity|trademark|branded/.test(
      blob,
    );

  if (blockedReason) return STENCIL_CONTENT_BLOCKED_MESSAGE;

  if (/NO_IMAGE|OTHER/.test(reasons) && !extractStencil(data)) {
    return STENCIL_CONTENT_BLOCKED_MESSAGE;
  }

  return null;
}

/** Verify the caller's Supabase session and return their user id (or null). */
async function getUserId(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const env = supabaseEnv();
  if (!env) return null;

  try {
    const res = await fetch(`${env.url}/auth/v1/user`, {
      headers: { apikey: env.anonKey, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const user = await res.json().catch(() => null);
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/** Upload a generated stencil and return a short signed HTTPS URL (required for mobile). */
async function uploadStencilSignedUrl(
  req: Request,
  userId: string,
  dataUrl: string,
): Promise<string | null> {
  const env = supabaseEnv();
  if (!env) return null;

  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/s);
  if (!match) return null;

  const userToken = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!userToken) return null;

  const mime = match[1];
  const bytes = Uint8Array.from(Buffer.from(match[2], "base64"));
  const id = crypto.randomUUID();
  const path = `stencils/${userId}/${id}/preview-stencil.png`;
  const storageAuth = env.serviceKey || userToken;
  const storageKey = env.serviceKey || env.anonKey;

  try {
    const uploadRes = await fetch(`${env.url}/storage/v1/object/uploads/${encodeURI(path)}`, {
      method: "POST",
      headers: {
        apikey: storageKey,
        Authorization: `Bearer ${storageAuth}`,
        "Content-Type": mime,
        "x-upsert": "false",
      },
      body: bytes,
    });
    if (!uploadRes.ok) {
      console.error("Stencil preview upload failed:", uploadRes.status, await uploadRes.text().catch(() => ""));
      return null;
    }

    const signRes = await fetch(`${env.url}/storage/v1/object/sign/uploads/${encodeURI(path)}`, {
      method: "POST",
      headers: {
        apikey: storageKey,
        Authorization: `Bearer ${storageAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: 3600 }),
    });
    if (!signRes.ok) {
      console.error("Stencil preview sign failed:", signRes.status, await signRes.text().catch(() => ""));
      return null;
    }

    const signData = (await signRes.json().catch(() => null)) as { signedURL?: string } | null;
    const signedPath = signData?.signedURL;
    if (!signedPath) return null;
    return signedPath.startsWith("http") ? signedPath : `${env.url}/storage/v1${signedPath}`;
  } catch (e) {
    console.error("Stencil preview upload error:", e);
    return null;
  }
}

/** Call a Postgres RPC through PostgREST using the caller's bearer token. */
async function callRpc(req: Request, fn: string, args: Record<string, unknown>): Promise<any> {
  const env = supabaseEnv();
  if (!env) return null;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  try {
    const res = await fetch(`${env.url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: env.anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

export default async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, req);
  }

  const userId = await getUserId(req);
  if (!userId) {
    return json({ error: "Not authorized. Please sign in again." }, 401, req);
  }

  let body: { image?: string; style?: string; delivery?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400, req);
  }

  const parsed = body.image ? parseImage(body.image) : null;
  if (!parsed) {
    return json({ error: "A reference image is required." }, 400, req);
  }

  const styleKey =
    typeof body.style === "string" && STENCIL_STYLES[body.style] ? body.style : DEFAULT_STYLE;
  const style = STENCIL_STYLES[styleKey];

  const baseUrl =
    process.env.GOOGLE_GEMINI_BASE_URL || process.env.NETLIFY_AI_GATEWAY_BASE_URL;
  const apiKey = process.env.GEMINI_API_KEY || process.env.NETLIFY_AI_GATEWAY_KEY;
  if (!baseUrl || !apiKey) {
    return json(
      {
        error:
          "Netlify AI Gateway is not available. Enable AI features for this site in Netlify (Team settings → AI) and ensure you have credits.",
      },
      503,
      req,
    );
  }

  // Claim one slot of the account's 24-hour allowance before spending credits.
  const claim = await callRpc(req, "claim_stencil_quota", {});
  if (claim && claim.allowed === false) {
    return json(
      {
        error: `Daily stencil limit reached (${claim.limit ?? 3} per 24 hours for your account). Please try again later.`,
        quota: claim,
      },
      429,
      req,
    );
  }
  const usageId: string | null = claim?.usage_id ?? null;

  // Refund the claimed slot if generation fails for any reason past this point.
  const refund = async () => {
    if (usageId) await callRpc(req, "refund_stencil_quota", { _usage_id: usageId });
  };

  const endpoint = `${baseUrl.replace(/\/$/, "")}/v1beta/models/${STENCIL_MODEL}:generateContent`;

  let aiRes: Response;
  try {
    aiRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: style.prompt },
              { inline_data: { mime_type: parsed.mimeType, data: parsed.base64 } },
            ],
          },
        ],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    });
  } catch (e) {
    await refund();
    return json({ error: "Could not reach the AI service. Please try again." }, 502, req);
  }

  if (!aiRes.ok) {
    await refund();
    if (aiRes.status === 429) {
      return json(
        { error: "Rate limit reached. Please try again in a moment." },
        429,
        req,
      );
    }
    if (aiRes.status === 402) {
      return json(
        { error: "Netlify AI credits exhausted. Top up your account to continue." },
        402,
        req,
      );
    }
    const detail = await aiRes.text().catch(() => "");
    console.error("AI Gateway error:", aiRes.status, detail.slice(0, 500));
    const blocked = explainStencilAiBlock(null, detail);
    if (blocked) {
      return json({ error: blocked, code: STENCIL_CONTENT_BLOCKED_CODE }, 422, req);
    }
    return json({ error: "The AI service returned an error. Please try again." }, 502, req);
  }

  const data = await aiRes.json().catch(() => null);
  const stencilUrl = data ? extractStencil(data) : null;
  if (!stencilUrl) {
    await refund();
    console.error("No image in AI response:", JSON.stringify(data).slice(0, 500));
    const blocked = explainStencilAiBlock(data);
    if (blocked) {
      return json({ error: blocked, code: STENCIL_CONTENT_BLOCKED_CODE }, 422, req);
    }
    return json(
      { error: "No stencil image was generated. Try a clearer reference image." },
      502,
      req,
    );
  }

  if (body.delivery === "url") {
    const signed = await uploadStencilSignedUrl(req, userId, stencilUrl);
    if (!signed) {
      await refund();
      return json(
        {
          error:
            "Could not store the generated stencil. Please try again — if this keeps happening, contact support.",
        },
        502,
        req,
      );
    }
    return json({ stencilUrl: signed, style: styleKey, quota: claim ?? null }, 200, req);
  }

  return json({ stencilUrl, style: styleKey, quota: claim ?? null }, 200, req);
};

export const config = {
  path: "/api/generate-stencil",
};

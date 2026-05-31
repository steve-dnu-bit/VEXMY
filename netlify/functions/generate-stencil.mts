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
//   2. A per-organization daily quota — one generation per occupied artist seat
//      per day — is claimed atomically before generation and refunded if the
//      render fails. This caps how many credits a studio can spend each day.

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
    label: "Bang Bang · signature line",
    prompt: `${STENCIL_BASE}

Style — Valoonia / pro transfer line-art:
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

type GeminiPart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function supabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const anonKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/$/, ""), anonKey };
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
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const userId = await getUserId(req);
  if (!userId) {
    return json({ error: "Not authorized. Please sign in again." }, 401);
  }

  let body: { image?: string; style?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const parsed = body.image ? parseImage(body.image) : null;
  if (!parsed) {
    return json({ error: "A reference image is required." }, 400);
  }

  const styleKey =
    typeof body.style === "string" && STENCIL_STYLES[body.style] ? body.style : DEFAULT_STYLE;
  const style = STENCIL_STYLES[styleKey];

  const baseUrl = process.env.GOOGLE_GEMINI_BASE_URL;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!baseUrl || !apiKey) {
    return json(
      {
        error:
          "Netlify AI Gateway is not enabled. Enable AI features for this site and redeploy.",
      },
      503,
    );
  }

  // Claim one slot of the org's daily allowance before spending any credits.
  const claim = await callRpc(req, "claim_stencil_quota", {});
  if (claim && claim.allowed === false) {
    return json(
      {
        error: `Daily stencil limit reached (${claim.limit ?? ""} per day for your studio). Resets at midnight.`,
        quota: claim,
      },
      429,
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
    return json({ error: "Could not reach the AI service. Please try again." }, 502);
  }

  if (!aiRes.ok) {
    await refund();
    if (aiRes.status === 429) {
      return json(
        { error: "Rate limit reached. Please try again in a moment." },
        429,
      );
    }
    if (aiRes.status === 402) {
      return json(
        { error: "Netlify AI credits exhausted. Top up your account to continue." },
        402,
      );
    }
    const detail = await aiRes.text().catch(() => "");
    console.error("AI Gateway error:", aiRes.status, detail.slice(0, 500));
    return json({ error: "The AI service returned an error. Please try again." }, 502);
  }

  const data = await aiRes.json().catch(() => null);
  const stencilUrl = data ? extractStencil(data) : null;
  if (!stencilUrl) {
    await refund();
    console.error("No image in AI response:", JSON.stringify(data).slice(0, 500));
    return json(
      { error: "No stencil image was generated. Try a clearer reference image." },
      502,
    );
  }

  return json({ stencilUrl, style: styleKey, quota: claim ?? null });
};

export const config = {
  path: "/api/generate-stencil",
};

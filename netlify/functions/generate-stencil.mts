// AI tattoo-stencil generator backed by Netlify AI Gateway.
//
// Converts an uploaded reference photo into a professional, transfer-ready
// "Valoonia-grade" black line-art stencil. Inference runs through Netlify AI
// Gateway (Gemini image model) and is billed to the site's Netlify credits —
// no third-party AI key required. Netlify injects GEMINI_API_KEY and
// GOOGLE_GEMINI_BASE_URL automatically at runtime.

// Image model used for generation. Any Gemini image model supported by AI
// Gateway can be swapped in here (e.g. "gemini-2.5-flash-image" for a cheaper,
// faster render). "gemini-3-pro-image" gives the highest stencil fidelity.
const STENCIL_MODEL = "gemini-3-pro-image";

const STENCIL_PROMPT = `Convert this reference into a professional tattoo stencil line drawing (like Valoonia / pro transfer stencils).

Requirements:
- Pure white (#FFFFFF) background only — no gray, texture, gradients, or photo artifacts
- Black (#000000) lines only — smooth, continuous, intentional contours
- Remove all shading and tonal rendering; represent form with clean linework only
- Preserve subject structure: faces, hair curls, hands, fabric folds, feathers as readable outlines
- Varying line weight: slightly bolder outer contours, finer interior detail lines
- No halftone, cross-hatching, or stipple unless a few essential mass lines
- Same composition and framing as the input — do not crop, rotate, or add elements
- High-resolution, vector-like appearance suitable for hectograph / thermal transfer paper`;

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

/** Verify the caller is an authenticated Supabase user before spending credits. */
async function verifyUser(req: Request): Promise<boolean> {
  const header = req.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;

  const supabaseUrl =
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const anonKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";
  if (!supabaseUrl || !anonKey) return false;

  try {
    const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authed = await verifyUser(req);
  if (!authed) {
    return json({ error: "Not authorized. Please sign in again." }, 401);
  }

  let image: string | undefined;
  try {
    ({ image } = await req.json());
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const parsed = image ? parseImage(image) : null;
  if (!parsed) {
    return json({ error: "A reference image is required." }, 400);
  }

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
              { text: STENCIL_PROMPT },
              { inline_data: { mime_type: parsed.mimeType, data: parsed.base64 } },
            ],
          },
        ],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    });
  } catch (e) {
    return json({ error: "Could not reach the AI service. Please try again." }, 502);
  }

  if (!aiRes.ok) {
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
    console.error("No image in AI response:", JSON.stringify(data).slice(0, 500));
    return json(
      { error: "No stencil image was generated. Try a clearer reference image." },
      502,
    );
  }

  return json({ stencilUrl });
};

export const config = {
  path: "/api/generate-stencil",
};

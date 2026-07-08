export const STENCIL_MODEL = "gemini-2.5-flash-image";

const STENCIL_BASE = `Produce a tattoo stencil line drawing from this reference.

Hard requirements (all styles):
- Pure white (#FFFFFF) background only — no gray, texture, gradients, or photo artifacts
- Black (#000000) ink only — no color
- Same composition and framing as the input — do not crop, rotate, or add elements
- Preserve subject structure: faces, hair, hands, fabric folds, feathers as readable shapes
- High-resolution, vector-like, clean edges suitable for hectograph / thermal transfer paper`;

export const STENCIL_STYLES: Record<string, { label: string; prompt: string }> = {
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

export const DEFAULT_STENCIL_STYLE = "valoonia";

export function parseImage(image: string): { mimeType: string; base64: string } | null {
  if (typeof image !== "string" || image.length === 0) return null;
  const match = image.match(/^data:([^;]+);base64,(.*)$/s);
  if (match) return { mimeType: match[1], base64: match[2] };
  return { mimeType: "image/jpeg", base64: image };
}

type GeminiPart = {
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
};

export function extractGeminiStencil(data: unknown): string | null {
  const parts: GeminiPart[] = (data as { candidates?: { content?: { parts?: GeminiPart[] } }[] })
    ?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline = part.inlineData ?? part.inline_data;
    const b64 = inline?.data;
    if (typeof b64 === "string" && b64.length > 0) {
      const mime = inline?.mimeType || inline?.mime_type || "image/png";
      return `data:${mime};base64,${b64}`;
    }
  }
  return null;
}

export function extractLovableStencil(data: unknown): string | null {
  const message = (data as { choices?: { message?: unknown }[] })?.choices?.[0]?.message;
  if (!message || typeof message !== "object") return null;

  const msg = message as {
    images?: { image_url?: { url?: string }; url?: string }[];
    content?: string | unknown[];
  };

  const direct = msg.images?.[0]?.image_url?.url || msg.images?.[0]?.url || null;
  if (typeof direct === "string" && direct.length > 0) return direct;

  if (typeof msg.content === "string") {
    if (msg.content.startsWith("data:image") || msg.content.startsWith("http")) return msg.content;
  }

  if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      const candidate =
        (b.image_url as { url?: string })?.url ||
        b.image_url ||
        b.url ||
        (b.source as { url?: string })?.url ||
        b.data;
      if (
        typeof candidate === "string" &&
        (candidate.startsWith("data:image") || candidate.startsWith("http"))
      ) {
        return candidate;
      }
    }
  }
  return null;
}

export function geminiConfig(): { apiKey: string; baseUrl: string } | null {
  const apiKey = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_AI_API_KEY") ?? "";
  const baseUrl = (
    Deno.env.get("GOOGLE_GEMINI_BASE_URL") ?? "https://generativelanguage.googleapis.com"
  ).replace(/\/$/, "");
  if (!apiKey) return null;
  return { apiKey, baseUrl };
}

export async function generateStencilWithGemini(
  prompt: string,
  parsed: { mimeType: string; base64: string },
): Promise<{ ok: true; stencilUrl: string } | { ok: false; status: number; detail: string }> {
  const config = geminiConfig();
  if (!config) {
    return { ok: false, status: 503, detail: "AI image generation is not configured." };
  }

  const endpoint = `${config.baseUrl}/v1beta/models/${STENCIL_MODEL}:generateContent`;
  let aiRes: Response;
  try {
    aiRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.apiKey },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              { inline_data: { mime_type: parsed.mimeType, data: parsed.base64 } },
            ],
          },
        ],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    });
  } catch {
    return { ok: false, status: 502, detail: "Could not reach the AI service." };
  }

  if (!aiRes.ok) {
    const detail = await aiRes.text().catch(() => "");
    console.error("Gemini error:", aiRes.status, detail.slice(0, 500));
    return { ok: false, status: aiRes.status, detail };
  }

  const data = await aiRes.json().catch(() => null);
  const stencilUrl = data ? extractGeminiStencil(data) : null;
  if (!stencilUrl) {
    console.error("No image in Gemini response:", JSON.stringify(data).slice(0, 500));
    return { ok: false, status: 502, detail: "No stencil image was generated." };
  }
  return { ok: true, stencilUrl };
}

export async function generateStencilWithLovable(
  prompt: string,
  imageDataUrl: string,
): Promise<{ ok: true; stencilUrl: string } | { ok: false; status: number; detail: string }> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return { ok: false, status: 503, detail: "AI image generation is not configured." };
  }

  let aiRes: Response;
  try {
    aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
        modalities: ["image", "text"],
      }),
    });
  } catch {
    return { ok: false, status: 502, detail: "Could not reach the AI service." };
  }

  if (!aiRes.ok) {
    const detail = await aiRes.text().catch(() => "");
    console.error("Lovable AI error:", aiRes.status, detail.slice(0, 500));
    return { ok: false, status: aiRes.status, detail };
  }

  const data = await aiRes.json().catch(() => null);
  const embeddedError =
    (data as { error?: { message?: string } | string })?.error &&
    (typeof (data as { error: { message?: string } }).error === "string"
      ? (data as { error: string }).error
      : (data as { error: { message?: string } }).error?.message);
  if (embeddedError) {
    return { ok: false, status: 502, detail: String(embeddedError) };
  }

  const stencilUrl = data ? extractLovableStencil(data) : null;
  if (!stencilUrl) {
    console.error("No image in Lovable response:", JSON.stringify(data).slice(0, 500));
    return { ok: false, status: 502, detail: "No stencil image was generated." };
  }
  return { ok: true, stencilUrl };
}

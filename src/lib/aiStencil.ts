import { CapacitorHttp } from "@capacitor/core";
import { getFreshAccessToken, invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import { resolveAppApiUrl } from "@/lib/apiOrigin";
import { prepareStencilUploadDataUrl } from "@/lib/stencilImage";
import { isNativeApp } from "@/lib/platform";

// Longest edge (px) sent to the AI. Keeps the request payload comfortably under
// the function body limit and speeds up generation without losing detail.
const MAX_UPLOAD_SIDE = 1536;

// AI generation can take 30–90s; native HTTP defaults are too short on some devices.
const NATIVE_HTTP_TIMEOUT_MS = 120_000;

// Available AI stencil styles. `id` is sent to the function (must match
// netlify/functions/generate-stencil.mts). `nameKey` is the capital-city
// name shown on the style card; `descKey` is the short technique descriptor below it.
export const STENCIL_STYLES = [
  { id: "valoonia", nameKey: "stencil.styleValooniaName", descKey: "stencil.styleValooniaDesc" },
  { id: "bold", nameKey: "stencil.styleBoldName", descKey: "stencil.styleBoldDesc" },
  { id: "fineline", nameKey: "stencil.styleFinelineName", descKey: "stencil.styleFinelineDesc" },
  { id: "sketch", nameKey: "stencil.styleSketchName", descKey: "stencil.styleSketchDesc" },
  { id: "dotwork", nameKey: "stencil.styleDotworkName", descKey: "stencil.styleDotworkDesc" },
  { id: "blackwork", nameKey: "stencil.styleBlackworkName", descKey: "stencil.styleBlackworkDesc" },
] as const;

export type StencilStyle = (typeof STENCIL_STYLES)[number]["id"];
export const DEFAULT_STENCIL_STYLE: StencilStyle = "valoonia";

export type QuotaInfo = {
  used?: number;
  limit?: number;
  remaining?: number;
  allowed?: boolean;
};

export class StencilQuotaError extends Error {
  quota?: QuotaInfo;
  constructor(message: string, quota?: QuotaInfo) {
    super(message);
    this.name = "StencilQuotaError";
    this.quota = quota;
  }
}

/** Typed generation failure so the UI can show specific copy (e.g. copyright blocks). */
export class StencilGenerationError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "StencilGenerationError";
    this.code = code;
  }
}

export const STENCIL_CONTENT_BLOCKED_CODE = "STENCIL_CONTENT_BLOCKED";

export function isStencilContentBlockedError(error: unknown): boolean {
  if (error instanceof StencilGenerationError && error.code === STENCIL_CONTENT_BLOCKED_CODE) {
    return true;
  }
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes(STENCIL_CONTENT_BLOCKED_CODE) ||
    /copyrighted or protected|branded character|published artwork|IMAGE_SAFETY|PROHIBITED_CONTENT/i.test(
      error.message,
    )
  );
}

export type AiStencilResult = {
  stencilUrl: string;
  style: string;
  quota?: QuotaInfo | null;
};

type StencilApiPayload = {
  stencilUrl?: string;
  style?: string;
  quota?: QuotaInfo | null;
  error?: string;
  code?: string;
};

type StencilRequestBody = {
  image: string;
  style: StencilStyle;
  /** Ask the server for a signed HTTPS URL instead of an inline data URL (required on mobile). */
  delivery?: "url";
};

function stencilRequestBody(image: string, style: StencilStyle): StencilRequestBody {
  return { image, style, delivery: "url" };
}

/** Inline data URLs are too large for the Capacitor native bridge — require HTTPS. */
function assertDeliverableStencilUrl(stencilUrl: string): void {
  if (!isNativeApp()) return;
  if (stencilUrl.startsWith("data:")) {
    throw new Error(
      "Stencil response was too large for the app. Please try again — a signed download link is required on mobile.",
    );
  }
}

/** Downscale + re-encode the reference so the request stays small and fast. */
async function toUploadDataUrl(file: File, cachedDataUrl?: string | null): Promise<string> {
  return prepareStencilUploadDataUrl(file, cachedDataUrl, MAX_UPLOAD_SIDE);
}

export function parseStencilApiResponse(
  status: number,
  payload: StencilApiPayload,
  style: StencilStyle,
): AiStencilResult {
  if (status === 429 && payload.quota) {
    throw new StencilQuotaError(payload.error || "Daily stencil limit reached.", payload.quota);
  }
  if (status < 200 || status >= 300) {
    const message = payload.error || `Generation failed (${status})`;
    if (
      status === 422 ||
      payload.code === STENCIL_CONTENT_BLOCKED_CODE ||
      /copyrighted or protected|branded character|published artwork|IMAGE_SAFETY|PROHIBITED_CONTENT/i.test(
        message,
      )
    ) {
      throw new StencilGenerationError(message, payload.code || STENCIL_CONTENT_BLOCKED_CODE);
    }
    throw new StencilGenerationError(message, payload.code);
  }
  if (!payload.stencilUrl) {
    throw new Error("No stencil image was returned.");
  }
  assertDeliverableStencilUrl(payload.stencilUrl);
  return {
    stencilUrl: payload.stencilUrl,
    style: payload.style || style,
    quota: payload.quota ?? null,
  };
}

function parseStencilPayload(data: unknown, contentType: string): StencilApiPayload {
  if (typeof data === "object" && data !== null) {
    return data as StencilApiPayload;
  }
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (!contentType.includes("application/json") && trimmed.startsWith("<")) {
      throw new Error("Stencil service unavailable. Check your connection and try again.");
    }
    try {
      return JSON.parse(trimmed) as StencilApiPayload;
    } catch {
      throw new Error("Stencil service unavailable. Check your connection and try again.");
    }
  }
  return {};
}

async function generateViaNetlifyFetch(
  image: string,
  style: StencilStyle,
  token: string,
): Promise<AiStencilResult> {
  const body = stencilRequestBody(image, style);
  const res = await fetch(resolveAppApiUrl("/api/generate-stencil"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      isNativeApp()
        ? "Stencil service unavailable. Check your connection and try again."
        : "Stencil service unavailable. The API did not return JSON — try refreshing or contact support.",
    );
  }

  const payload = (await res.json().catch(() => ({}))) as StencilApiPayload;
  return parseStencilApiResponse(res.status, payload, style);
}

/**
 * Native HTTP avoids Capacitor's patched fetch dropping large JSON bodies.
 * On mobile we request delivery=url so the response stays small enough for the native bridge.
 */
async function generateViaNativeHttp(
  image: string,
  style: StencilStyle,
  token: string,
): Promise<AiStencilResult> {
  const body = stencilRequestBody(image, style);
  const response = await CapacitorHttp.post({
    url: resolveAppApiUrl("/api/generate-stencil"),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    data: body,
    responseType: "json",
    readTimeout: NATIVE_HTTP_TIMEOUT_MS,
    connectTimeout: 30_000,
  });

  const headers = response.headers ?? {};
  const contentType = String(headers["Content-Type"] || headers["content-type"] || "");
  const payload = parseStencilPayload(response.data, contentType);
  return parseStencilApiResponse(response.status, payload, style);
}

async function generateViaSupabaseFunction(
  image: string,
  style: StencilStyle,
): Promise<AiStencilResult> {
  const body = stencilRequestBody(image, style);
  const { data, error } = await invokeEdgeFunctionJson<StencilApiPayload>("generate-stencil", body);
  if (error) throw error;
  return parseStencilApiResponse(200, data ?? {}, style);
}

function shouldTryFallback(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("stencil service unavailable") ||
    msg.includes("not configured") ||
    msg.includes("non-2xx") ||
    msg.includes("failed to send") ||
    msg.includes("network") ||
    msg.includes("fetch") ||
    msg.includes("timeout") ||
    msg.includes("no stencil image") ||
    msg.includes("could not store") ||
    msg.includes("not configured yet") ||
    msg.includes("ai gateway") ||
    msg.includes("reference image") ||
    msg.includes("too large for the app") ||
    msg.includes("invalid request") ||
    msg.includes("unauthorized") ||
    msg.includes("session expired") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504")
  );
}

async function generateOnNative(
  image: string,
  style: StencilStyle,
  token: string,
): Promise<AiStencilResult> {
  // Prefer CapacitorHttp with a long timeout — patched fetch often drops large bodies
  // or times out before Gemini finishes (30–90s).
  try {
    return await generateViaNativeHttp(image, style, token);
  } catch (nativeError) {
    if (!shouldTryFallback(nativeError)) throw nativeError;
  }

  try {
    return await generateViaSupabaseFunction(image, style);
  } catch (supabaseError) {
    if (!shouldTryFallback(supabaseError)) throw supabaseError;
    return generateViaNetlifyFetch(image, style, token);
  }
}

async function generateOnWeb(
  image: string,
  style: StencilStyle,
  token: string,
): Promise<AiStencilResult> {
  try {
    return await generateViaNetlifyFetch(image, style, token);
  } catch (netlifyError) {
    if (!shouldTryFallback(netlifyError)) throw netlifyError;
  }
  return generateViaSupabaseFunction(image, style);
}

/**
 * Generate a tattoo stencil via Netlify AI Gateway (Gemini image model).
 * Valoonia / pro transfer styles are prompt presets on the server function.
 */
export async function generateAiStencil(
  file: File,
  style: StencilStyle = DEFAULT_STENCIL_STYLE,
  cachedDataUrl?: string | null,
): Promise<AiStencilResult> {
  const token = await getFreshAccessToken();
  if (!token) throw new Error("Session expired. Please sign in again.");

  const image = await toUploadDataUrl(file, cachedDataUrl);

  if (isNativeApp()) {
    return generateOnNative(image, style, token);
  }
  return generateOnWeb(image, style, token);
}

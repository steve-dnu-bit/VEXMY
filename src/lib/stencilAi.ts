import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";

export const STENCIL_AI_MAX_PER_MONTH = 10;

type GenerateStencilResponse = {
  stencilUrl?: string;
  aiRemaining?: number;
  error?: string;
};

export async function fetchStencilAiRemaining(): Promise<number> {
  const { data, error } = await supabase.rpc("stencil_ai_remaining");
  if (error) throw new Error(error.message);
  return typeof data === "number" ? data : STENCIL_AI_MAX_PER_MONTH;
}

async function normalizeStencilImageUrl(url: string): Promise<string> {
  if (url.startsWith("data:image")) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load AI stencil image");
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read AI stencil image"));
    reader.readAsDataURL(blob);
  });
}

export async function generateAiStencil(imageUrl: string): Promise<{ stencilDataUrl: string; aiRemaining: number }> {
  const { data, error } = await invokeEdgeFunctionJson<GenerateStencilResponse>("generate-stencil", { imageUrl });

  if (error) {
    const remaining = typeof data?.aiRemaining === "number" ? data.aiRemaining : undefined;
    const message = data?.error || error.message;
    const quotaError = new Error(message) as Error & { aiRemaining?: number };
    if (remaining !== undefined) quotaError.aiRemaining = remaining;
    throw quotaError;
  }

  if (data?.error) {
    const quotaError = new Error(data.error) as Error & { aiRemaining?: number };
    if (typeof data.aiRemaining === "number") quotaError.aiRemaining = data.aiRemaining;
    throw quotaError;
  }

  if (!data?.stencilUrl) throw new Error("No stencil image was returned");

  const stencilDataUrl = await normalizeStencilImageUrl(data.stencilUrl);
  const aiRemaining =
    typeof data.aiRemaining === "number" ? data.aiRemaining : Math.max(0, STENCIL_AI_MAX_PER_MONTH - 1);

  return { stencilDataUrl, aiRemaining };
}

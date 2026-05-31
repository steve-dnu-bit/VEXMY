import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  callerHasStaffAccess,
  jsonResponse,
  requireAuthenticatedUser,
} from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STENCIL_AI_MAX_PER_MONTH = 10;

function currentPeriodMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

async function getAiUsageCount(admin: ReturnType<typeof createClient>, userId: string): Promise<number> {
  const periodMonth = currentPeriodMonth();
  const { data } = await admin
    .from("stencil_ai_usage")
    .select("generation_count")
    .eq("user_id", userId)
    .eq("period_month", periodMonth)
    .maybeSingle();
  return data?.generation_count ?? 0;
}

async function incrementAiUsage(admin: ReturnType<typeof createClient>, userId: string): Promise<number> {
  const periodMonth = currentPeriodMonth();
  const used = await getAiUsageCount(admin, userId);
  const next = used + 1;

  const { error } = await admin.from("stencil_ai_usage").upsert(
    {
      user_id: userId,
      period_month: periodMonth,
      generation_count: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,period_month" },
  );

  if (error) throw error;
  return next;
}

function extractStencilImage(data: any): string | null {
  const message = data?.choices?.[0]?.message;
  if (!message) return null;

  const direct =
    message.images?.[0]?.image_url?.url ||
    message.images?.[0]?.url ||
    null;
  if (typeof direct === "string" && direct.length > 0) return direct;

  if (typeof message.content === "string") {
    if (message.content.startsWith("data:image")) return message.content;
    if (message.content.startsWith("http")) return message.content;
  }

  if (Array.isArray(message.content)) {
    for (const block of message.content) {
      const candidate =
        block?.image_url?.url ||
        block?.image_url ||
        block?.url ||
        block?.source?.url ||
        block?.data ||
        null;
      if (typeof candidate === "string" && (candidate.startsWith("data:image") || candidate.startsWith("http"))) {
        return candidate;
      }
    }
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }
    const admin = createClient(supabaseUrl, serviceKey);
    const authResult = await requireAuthenticatedUser(admin, req);
    if ("status" in authResult) {
      return jsonResponse(authResult.body, authResult.status);
    }
    const canUse = await callerHasStaffAccess(admin, authResult.user.id);
    if (!canUse) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const userId = authResult.user.id;
    const { imageUrl } = await req.json();
    if (!imageUrl) throw new Error("imageUrl is required");

    const used = await getAiUsageCount(admin, userId);
    if (used >= STENCIL_AI_MAX_PER_MONTH) {
      return jsonResponse(
        { error: "Monthly AI stencil limit reached (10). Resets next calendar month.", aiRemaining: 0 },
        429,
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Convert this reference into a professional tattoo stencil line drawing (like Valoonia / pro transfer stencils).

Requirements:
- Pure white (#FFFFFF) background only — no gray, texture, gradients, or photo artifacts
- Black (#000000) lines only — smooth, continuous, intentional contours
- Remove all shading and tonal rendering; represent form with clean linework only
- Preserve subject structure: faces, hair curls, hands, fabric folds, feathers as readable outlines
- Varying line weight: slightly bolder outer contours, finer interior detail lines
- No halftone, cross-hatching, or stipple unless a few essential mass lines
- Same composition and framing as the input — do not crop, rotate, or add elements
- High-resolution, vector-like appearance suitable for hectograph / thermal transfer paper`,
              },
              {
                type: "image_url",
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI response structure:", JSON.stringify(data).substring(0, 500));

    const embeddedError =
      data?.error?.message ||
      (typeof data?.error === "string" ? data.error : null);
    if (embeddedError) {
      throw new Error(`AI provider error: ${embeddedError}`);
    }

    const stencilImage = extractStencilImage(data);

    if (!stencilImage) {
      console.error("Full AI response:", JSON.stringify(data));
      throw new Error("No stencil image was generated from AI response.");
    }

    await incrementAiUsage(admin, userId);
    const aiRemaining = Math.max(0, STENCIL_AI_MAX_PER_MONTH - used - 1);

    return new Response(JSON.stringify({ stencilUrl: stencilImage, aiRemaining }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Stencil generation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

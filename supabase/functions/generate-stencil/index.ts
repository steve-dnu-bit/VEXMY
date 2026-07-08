import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { jsonResponse, parseBearerToken, requireAuthenticatedUser } from "../_shared/auth.ts";
import {
  DEFAULT_STENCIL_STYLE,
  STENCIL_STYLES,
  generateStencilWithGemini,
  generateStencilWithLovable,
  geminiConfig,
  parseImage,
} from "../_shared/stencil-ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !serviceKey || !anonKey) {
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const authResult = await requireAuthenticatedUser(admin, req);
    if ("status" in authResult) {
      return jsonResponse(authResult.body, authResult.status);
    }

    const token = parseBearerToken(req);
    if (!token) {
      return jsonResponse({ error: "Not authorized. Please sign in again." }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    let body: { image?: string; style?: string; delivery?: string } = {};
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid request body" }, 400);
    }

    const parsed = body.image ? parseImage(body.image) : null;
    if (!parsed) {
      return jsonResponse({ error: "A reference image is required." }, 400);
    }

    const styleKey =
      typeof body.style === "string" && STENCIL_STYLES[body.style] ? body.style : DEFAULT_STENCIL_STYLE;
    const style = STENCIL_STYLES[styleKey];

    if (!geminiConfig() && !Deno.env.get("LOVABLE_API_KEY")) {
      return jsonResponse(
        {
          error:
            "AI stencil is not configured yet. Add a GEMINI_API_KEY to Supabase secrets (Google AI Studio).",
        },
        503,
      );
    }

    const { data: claim, error: claimError } = await userClient.rpc("claim_stencil_quota");
    if (claimError) {
      console.error("claim_stencil_quota error:", claimError);
      return jsonResponse({ error: "Could not verify stencil quota." }, 500);
    }

    const quota = claim as Record<string, unknown> | null;
    if (quota?.allowed === false) {
      return jsonResponse(
        {
          error: `Daily stencil limit reached (${quota.limit ?? 3} per 24 hours for your account). Please try again later.`,
          quota,
        },
        429,
      );
    }

    const usageId = typeof quota?.usage_id === "string" ? quota.usage_id : null;
    const refund = async () => {
      if (usageId) await userClient.rpc("refund_stencil_quota", { _usage_id: usageId });
    };

    const imageDataUrl = `data:${parsed.mimeType};base64,${parsed.base64}`;
    const aiResult = geminiConfig()
      ? await generateStencilWithGemini(style.prompt, parsed)
      : await generateStencilWithLovable(style.prompt, imageDataUrl);

    if (!aiResult.ok) {
      await refund();
      if (aiResult.status === 429) {
        return jsonResponse({ error: "Rate limit reached. Please try again in a moment." }, 429);
      }
      if (aiResult.status === 402) {
        return jsonResponse({ error: "AI credits exhausted. Please top up to continue." }, 402);
      }
      if (aiResult.status === 503) {
        return jsonResponse({ error: aiResult.detail }, 503);
      }
      return jsonResponse({ error: "The AI service returned an error. Please try again." }, 502);
    }

    let responseUrl = aiResult.stencilUrl;
    if (body.delivery === "url") {
      const match = aiResult.stencilUrl.match(/^data:([^;]+);base64,(.*)$/s);
      if (!match) {
        await refund();
        return jsonResponse({ error: "Unexpected stencil format from AI." }, 502);
      }
      const id = crypto.randomUUID();
      const path = `stencils/${authResult.user.id}/${id}/preview-stencil.png`;
      const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
      const { error: uploadError } = await admin.storage.from("uploads").upload(path, bytes, {
        contentType: match[1],
        upsert: false,
      });
      if (uploadError) {
        console.error("Stencil preview upload failed:", uploadError);
        await refund();
        return jsonResponse(
          {
            error:
              "Could not store the generated stencil. Please try again — if this keeps happening, contact support.",
          },
          502,
        );
      }
      const { data: signed, error: signError } = await admin.storage
        .from("uploads")
        .createSignedUrl(path, 3600);
      if (signError || !signed?.signedUrl) {
        console.error("Stencil preview sign failed:", signError);
        await admin.storage.from("uploads").remove([path]);
        await refund();
        return jsonResponse({ error: "Could not prepare stencil download link." }, 502);
      }
      responseUrl = signed.signedUrl;
    }

    return new Response(
      JSON.stringify({ stencilUrl: responseUrl, style: styleKey, quota }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("Stencil generation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { loadPosReceiptBundleByToken } from "../_shared/pos-receipt-email.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let token = url.searchParams.get("token")?.trim() || "";
    let download = url.searchParams.get("download") === "1" || url.searchParams.get("format") === "pdf";

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({})) as { token?: string; download?: boolean };
      if (typeof body.token === "string") token = body.token.trim();
      if (body.download) download = true;
    }

    if (!token) {
      return new Response(JSON.stringify({ error: "token is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const bundle = await loadPosReceiptBundleByToken(admin, token);
    if (!bundle) {
      return new Response(JSON.stringify({ error: "Receipt not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (download || req.headers.get("accept")?.includes("application/pdf")) {
      const bytes = base64ToUint8Array(bundle.pdfBase64);
      return new Response(bytes, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${bundle.filename}"`,
          "Cache-Control": "private, max-age=300",
        },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        receiptNumber: bundle.receiptNumber,
        shopName: bundle.shopName,
        clientName: bundle.clientName,
        amountPaidText: bundle.amountPaidText,
        paidAtText: bundle.paidAtText,
        filename: bundle.filename,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Receipt lookup failed";
    console.error("pos-receipt failed", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

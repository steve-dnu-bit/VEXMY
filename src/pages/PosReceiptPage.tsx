import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { BRANDING } from "@/lib/branding";

type ReceiptMeta = {
  receiptNumber?: string;
  shopName?: string;
  clientName?: string;
  amountPaidText?: string;
  paidAtText?: string;
  filename?: string;
};

export default function PosReceiptPage() {
  const { token = "" } = useParams<{ token: string }>();
  const [meta, setMeta] = useState<ReceiptMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!token.trim()) {
        setError("Missing receipt link.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const { data, error: fnError } = await supabase.functions.invoke("pos-receipt", {
          body: { token },
        });
        if (cancelled) return;
        if (fnError) {
          setError(fnError.message || "Could not load receipt.");
          setMeta(null);
          return;
        }
        if (data?.error) {
          setError(String(data.error));
          setMeta(null);
          return;
        }
        setMeta(data as ReceiptMeta);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load receipt.");
          setMeta(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const downloadPdf = async () => {
    if (!token.trim()) return;
    setDownloading(true);
    try {
      const base = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
      const res = await fetch(
        `${base}/functions/v1/pos-receipt?token=${encodeURIComponent(token)}&download=1`,
        {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
          },
        },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text.slice(0, 160) || "Download failed");
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = meta?.filename || `receipt-${token.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-md space-y-6 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="space-y-1 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{BRANDING.name}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {meta?.shopName ? `${meta.shopName} receipt` : "Your receipt"}
          </h1>
          {meta?.receiptNumber ? (
            <p className="text-sm text-muted-foreground">#{meta.receiptNumber}</p>
          ) : null}
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-center text-sm text-destructive">{error}</p>
        ) : (
          <div className="space-y-3 text-sm">
            {meta?.clientName ? (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Client</span>
                <span className="font-medium text-right">{meta.clientName}</span>
              </div>
            ) : null}
            {meta?.amountPaidText ? (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-medium tabular-nums">{meta.amountPaidText}</span>
              </div>
            ) : null}
            {meta?.paidAtText ? (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Date</span>
                <span className="text-right">{meta.paidAtText}</span>
              </div>
            ) : null}
          </div>
        )}

        {!error ? (
          <Button type="button" className="w-full" disabled={loading || downloading} onClick={() => void downloadPdf()}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
            Download PDF
          </Button>
        ) : null}
      </div>
    </div>
  );
}

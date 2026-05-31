import { format, parseISO } from "date-fns";

/** Safe filename stem for a downloaded consent PDF. */
export function consentPdfBasename(clientName: string, signedAtIso: string): string {
  const safe = (clientName || "client")
    .trim()
    .replace(/[^a-zA-Z0-9\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 48);
  const d = signedAtIso ? format(parseISO(signedAtIso), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
  return `Velbok-consent-${safe || "client"}-${d}`;
}

/** Download PDF via blob so the browser saves a real file (with filename). */
export async function downloadConsentPdf(url: string, basename: string): Promise<boolean> {
  const name = basename.endsWith(".pdf") ? basename : `${basename}.pdf`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    return true;
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
    return false;
  }
}

/** Open print dialog for a remote PDF (fetch → blob → iframe print). */
export function printConsentPdf(url: string): void {
  void (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.setAttribute("title", "Consent PDF print");
      iframe.setAttribute(
        "style",
        "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none",
      );
      iframe.src = objectUrl;
      const cleanup = () => {
        URL.revokeObjectURL(objectUrl);
        iframe.remove();
      };
      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch {
            window.open(objectUrl, "_blank", "noopener,noreferrer");
          }
          setTimeout(cleanup, 120_000);
        }, 300);
      };
      document.body.appendChild(iframe);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  })();
}

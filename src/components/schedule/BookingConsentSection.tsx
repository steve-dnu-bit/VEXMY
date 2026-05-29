import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";
import { format, parseISO } from "date-fns";
import { consentPdfBasename, downloadConsentPdf, printConsentPdf } from "@/lib/consentPdfActions";
import { toast } from "sonner";

interface BookingConsentSectionProps {
  bookingConsentLoading: boolean;
  bookingConsentRows: Array<{ id: string; consent_pdf_url: string | null; created_at: string }>;
  clientName: string;
  consentDownloadBusy: boolean;
  setConsentDownloadBusy: (busy: boolean) => void;
}

const BookingConsentSection = ({
  bookingConsentLoading,
  bookingConsentRows,
  clientName,
  consentDownloadBusy,
  setConsentDownloadBusy,
}: BookingConsentSectionProps) => (
  <div className="rounded-md border border-border bg-secondary/30 p-3 space-y-2">
    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Signed consent</p>
    {bookingConsentLoading ? (
      <p className="text-xs text-muted-foreground">Checking…</p>
    ) : bookingConsentRows.length === 0 ? (
      <p className="text-xs text-muted-foreground">No consent submitted for this booking yet.</p>
    ) : bookingConsentRows[0].consent_pdf_url ? (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Signed {format(parseISO(bookingConsentRows[0].created_at), "d MMM yyyy, HH:mm")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={() => printConsentPdf(bookingConsentRows[0].consent_pdf_url!)}
          >
            <Printer className="h-3 w-3 shrink-0" />
            Print consent
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1"
            disabled={consentDownloadBusy}
            onClick={async () => {
              const url = bookingConsentRows[0].consent_pdf_url!;
              setConsentDownloadBusy(true);
              try {
                const base = consentPdfBasename(clientName, bookingConsentRows[0].created_at);
                const ok = await downloadConsentPdf(url, base);
                if (!ok) {
                  toast.info("Opened consent in a new tab — use Save as to download if needed.");
                }
              } finally {
                setConsentDownloadBusy(false);
              }
            }}
          >
            <Download className="h-3 w-3 shrink-0" />
            {consentDownloadBusy ? "Downloading…" : "Download consent"}
          </Button>
        </div>
      </div>
    ) : (
      <p className="text-xs text-muted-foreground">Consent signed; PDF not on file.</p>
    )}
  </div>
);

export default BookingConsentSection;

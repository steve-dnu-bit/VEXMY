import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";
import { format, parseISO } from "date-fns";
import { consentPdfBasename, downloadConsentPdf, printConsentPdf } from "@/lib/consentPdfActions";
import { toast } from "sonner";
import { useScheduleI18n } from "@/hooks/useScheduleI18n";

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
}: BookingConsentSectionProps) => {
  const { t } = useScheduleI18n();
  return (
    <div className="rounded-md border border-border bg-secondary/30 p-3 space-y-2">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("schedule.signedConsent")}</p>
      {bookingConsentLoading ? (
        <p className="text-xs text-muted-foreground">{t("schedule.checking")}</p>
      ) : bookingConsentRows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("schedule.noConsentYet")}</p>
      ) : bookingConsentRows[0].consent_pdf_url ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {t("schedule.signedAt", { date: format(parseISO(bookingConsentRows[0].created_at), "d MMM yyyy, HH:mm") })}
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
              {t("schedule.printConsent")}
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
                    toast.info(t("schedule.consentOpenTab"));
                  }
                } finally {
                  setConsentDownloadBusy(false);
                }
              }}
            >
              <Download className="h-3 w-3 shrink-0" />
              {consentDownloadBusy ? t("schedule.downloading") : t("schedule.downloadConsent")}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("schedule.consentSignedNoPdf")}</p>
      )}
    </div>
  );
};

export default BookingConsentSection;

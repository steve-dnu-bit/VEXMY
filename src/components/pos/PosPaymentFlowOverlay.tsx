import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, Mail, Phone, Share2, XCircle } from "lucide-react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type PosPaymentFlowPhase =
  | "hidden"
  | "initializing"
  | "processing"
  | "approved"
  | "declined"
  | "timed_out";

export type PosPaymentFlowOverlayProps = {
  phase: PosPaymentFlowPhase;
  amountLabel?: string;
  detail?: string | null;
  receiptHint?: string | null;
  /** Public receipt page URL for QR / SMS (succeeded payments only). */
  receiptUrl?: string | null;
  onDismiss: () => void;
  onCancel?: () => Promise<void> | void;
  /** Legacy share / mailto fallback. */
  onShareReceipt?: (email?: string) => Promise<void> | void;
  /** Server-send PDF receipt email. */
  onSendReceiptEmail?: (email: string) => Promise<void> | void;
  /** Server-send SMS link, or open device SMS if Twilio not configured. */
  onSendReceiptSms?: (phone: string) => Promise<void> | void;
};

export function PosPaymentFlowOverlay({
  phase,
  amountLabel,
  detail,
  receiptHint,
  receiptUrl,
  onDismiss,
  onCancel,
  onShareReceipt,
  onSendReceiptEmail,
  onSendReceiptSms,
}: PosPaymentFlowOverlayProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sharing, setSharing] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!receiptUrl || phase !== "approved") {
      setQrDataUrl(null);
      return;
    }
    void QRCode.toDataURL(receiptUrl, {
      width: 196,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#111111", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [receiptUrl, phase]);

  if (phase === "hidden") return null;

  const busy = phase === "initializing" || phase === "processing";
  const success = phase === "approved";
  const failed = phase === "declined" || phase === "timed_out";
  const showReceiptTools = success && (!!receiptUrl || !!onSendReceiptEmail || !!onSendReceiptSms || !!onShareReceipt);

  const title =
    phase === "initializing"
      ? t("pos.paymentInitializing")
      : phase === "processing"
        ? t("pos.paymentProcessing")
        : phase === "approved"
          ? t("pos.paymentApproved")
          : phase === "timed_out"
            ? t("pos.paymentTimedOut")
            : t("pos.paymentDeclined");

  const share = async () => {
    if (!onShareReceipt) return;
    setSharing(true);
    try {
      await onShareReceipt(email.trim() || undefined);
    } finally {
      setSharing(false);
    }
  };

  const sendEmail = async () => {
    const value = email.trim();
    if (!value) return;
    if (onSendReceiptEmail) {
      setSendingEmail(true);
      try {
        await onSendReceiptEmail(value);
      } finally {
        setSendingEmail(false);
      }
      return;
    }
    await share();
  };

  const sendSms = async () => {
    const value = phone.trim();
    if (!value || !onSendReceiptSms) return;
    setSendingSms(true);
    try {
      await onSendReceiptSms(value);
    } finally {
      setSendingSms(false);
    }
  };

  const cancel = async () => {
    if (!onCancel || cancelling) return;
    setCancelling(true);
    try {
      await onCancel();
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pos-payment-flow-title"
    >
      <div
        className={cn(
          "w-full max-w-md rounded-2xl border bg-background p-6 shadow-xl max-h-[92vh] overflow-y-auto",
          success && "border-emerald-500/40",
          failed && "border-destructive/40",
        )}
      >
        <div className="flex flex-col items-center text-center gap-3">
          {busy ? (
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          ) : success ? (
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          ) : (
            <XCircle className="h-10 w-10 text-destructive" />
          )}
          <div className="space-y-1">
            <h2 id="pos-payment-flow-title" className="text-xl font-semibold tracking-tight">
              {title}
            </h2>
            {amountLabel ? <p className="text-2xl font-bold tabular-nums">{amountLabel}</p> : null}
            {detail ? <p className="text-sm text-muted-foreground whitespace-pre-wrap">{detail}</p> : null}
            {busy && phase === "initializing" ? (
              <p className="text-sm text-muted-foreground">{t("pos.paymentInitializingHint")}</p>
            ) : null}
            {busy && phase === "processing" ? (
              <p className="text-sm text-muted-foreground">{t("pos.paymentProcessingHint")}</p>
            ) : null}
          </div>
        </div>

        {busy && onCancel ? (
          <div className="mt-6">
            <Button type="button" variant="outline" className="w-full" disabled={cancelling} onClick={() => void cancel()}>
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t("common.cancel")}
            </Button>
          </div>
        ) : null}

        {!busy ? (
          <div className="mt-6 space-y-4">
            {showReceiptTools ? (
              <div className="space-y-4 text-left">
                <div className="space-y-1">
                  <Label>{t("pos.digitalReceiptTitle")}</Label>
                  <p className="text-xs text-muted-foreground">{t("pos.receiptDeliveryHint")}</p>
                  {receiptHint ? (
                    <p className="text-xs text-emerald-700 dark:text-emerald-400">{receiptHint}</p>
                  ) : null}
                </div>

                {receiptUrl && qrDataUrl ? (
                  <div className="flex flex-col items-center gap-2 rounded-xl border bg-muted/30 p-4">
                    <img src={qrDataUrl} alt={t("pos.receiptQrAlt")} className="h-44 w-44 rounded-md bg-white" />
                    <p className="text-xs text-center text-muted-foreground">{t("pos.receiptQrHint")}</p>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="pos-receipt-email">{t("pos.sendReceiptEmail")}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="pos-receipt-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder={t("pos.clientEmailPlaceholder")}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={sendingEmail || !email.trim()}
                      onClick={() => void sendEmail()}
                      aria-label={t("pos.sendReceiptEmail")}
                    >
                      {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {onSendReceiptSms ? (
                  <div className="space-y-2">
                    <Label htmlFor="pos-receipt-phone">{t("pos.sendReceiptSms")}</Label>
                    <div className="flex gap-2">
                      <Input
                        id="pos-receipt-phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder={t("pos.clientPhonePlaceholder")}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={sendingSms || !phone.trim()}
                        onClick={() => void sendSms()}
                        aria-label={t("pos.sendReceiptSms")}
                      >
                        {sendingSms ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {onShareReceipt ? (
                  <Button type="button" variant="secondary" className="w-full" disabled={sharing} onClick={() => void share()}>
                    {sharing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Share2 className="h-4 w-4 mr-2" />}
                    {t("pos.shareReceipt")}
                  </Button>
                ) : null}
              </div>
            ) : onShareReceipt ? (
              <div className="space-y-2 text-left">
                <Label htmlFor="pos-receipt-email">{t("pos.digitalReceiptTitle")}</Label>
                <p className="text-xs text-muted-foreground">{t("pos.digitalReceiptHint")}</p>
                {receiptHint ? <p className="text-xs text-emerald-700 dark:text-emerald-400">{receiptHint}</p> : null}
                <div className="flex gap-2">
                  <Input
                    id="pos-receipt-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder={t("pos.clientEmailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Button type="button" variant="outline" size="icon" disabled={sharing} onClick={() => void share()} aria-label={t("pos.shareReceipt")}>
                    {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : email.trim() ? <Mail className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                  </Button>
                </div>
                <Button type="button" variant="secondary" className="w-full" disabled={sharing} onClick={() => void share()}>
                  {sharing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Share2 className="h-4 w-4 mr-2" />}
                  {t("pos.shareReceipt")}
                </Button>
              </div>
            ) : null}
            <Button type="button" className="w-full" onClick={onDismiss}>
              {t("common.done")}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

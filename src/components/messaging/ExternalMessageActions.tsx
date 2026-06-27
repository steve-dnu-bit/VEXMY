import { Copy, Instagram, Mail, MessageCircle, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildInstagramDmUrl, buildMailtoUrl, buildSmsUrl, buildWhatsAppUrl } from "@/lib/messagingLinks";
import { openExternalUrl } from "@/lib/openExternalUrl";
import { useTranslation } from "react-i18next";
import { toast } from "@/hooks/use-toast";

interface ExternalMessageActionsProps {
  phone?: string | null;
  email?: string | null;
  instagramHandle?: string | null;
  whatsAppMessage?: string;
  emailSubject?: string;
  emailBody?: string;
  smsMessage?: string;
  size?: "sm" | "default";
  className?: string;
  layout?: "row" | "column";
  showCopy?: boolean;
}

const ExternalMessageActions = ({
  phone,
  email,
  instagramHandle,
  whatsAppMessage,
  emailSubject,
  emailBody,
  smsMessage,
  size = "sm",
  className = "",
  layout = "row",
  showCopy = true,
}: ExternalMessageActionsProps) => {
  const { t } = useTranslation();
  const whatsAppUrl = phone ? buildWhatsAppUrl(phone, whatsAppMessage) : null;
  const smsUrl = phone ? buildSmsUrl(phone, smsMessage ?? whatsAppMessage) : null;
  const mailtoUrl = email ? buildMailtoUrl(email, emailSubject, emailBody ?? whatsAppMessage) : null;
  const instagramUrl = instagramHandle ? buildInstagramDmUrl(instagramHandle) : null;

  const copyValue = email?.trim() || phone?.trim() || null;

  const handleCopy = async () => {
    if (!copyValue) return;
    try {
      await navigator.clipboard.writeText(copyValue);
      toast({ title: t("messaging.copied") });
    } catch {
      toast({ title: t("common.error"), variant: "destructive" });
    }
  };

  const openLink = (url: string) => {
    void openExternalUrl(url).catch(() => {
      toast({ title: t("common.error"), variant: "destructive" });
    });
  };

  if (!whatsAppUrl && !smsUrl && !mailtoUrl && !instagramUrl && !copyValue) return null;

  return (
    <div className={`flex gap-2 ${layout === "column" ? "flex-col" : "flex-wrap items-center"} ${className}`}>
      {whatsAppUrl ? (
        <Button
          size={size}
          variant="outline"
          className="gap-1.5 text-xs h-8"
          type="button"
          onClick={() => openLink(whatsAppUrl)}
        >
          <MessageCircle className="h-3.5 w-3.5 text-emerald-400" />
          {t("messaging.whatsapp")}
        </Button>
      ) : null}
      {smsUrl ? (
        <Button size={size} variant="outline" className="gap-1.5 text-xs h-8" type="button" onClick={() => openLink(smsUrl)}>
          <MessageSquareText className="h-3.5 w-3.5 text-sky-400" />
          {t("messaging.sms")}
        </Button>
      ) : null}
      {mailtoUrl ? (
        <Button size={size} variant="outline" className="gap-1.5 text-xs h-8" type="button" onClick={() => openLink(mailtoUrl)}>
          <Mail className="h-3.5 w-3.5 text-blue-400" />
          {t("messaging.email")}
        </Button>
      ) : null}
      {instagramUrl ? (
        <Button
          size={size}
          variant="outline"
          className="gap-1.5 text-xs h-8"
          type="button"
          onClick={() => openLink(instagramUrl)}
        >
          <Instagram className="h-3.5 w-3.5 text-pink-400" />
          {t("messaging.instagram")}
        </Button>
      ) : null}
      {showCopy && copyValue ? (
        <Button size={size} variant="ghost" className="gap-1.5 text-xs h-8" type="button" onClick={() => void handleCopy()}>
          <Copy className="h-3.5 w-3.5" />
          {t("messaging.copy")}
        </Button>
      ) : null}
    </div>
  );
};

export default ExternalMessageActions;

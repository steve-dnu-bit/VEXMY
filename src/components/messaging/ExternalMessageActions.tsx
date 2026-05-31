import { Instagram, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildInstagramDmUrl, buildWhatsAppUrl } from "@/lib/messagingLinks";
import { useTranslation } from "react-i18next";

interface ExternalMessageActionsProps {
  phone?: string | null;
  instagramHandle?: string | null;
  whatsAppMessage?: string;
  size?: "sm" | "default";
  className?: string;
  layout?: "row" | "column";
}

const ExternalMessageActions = ({
  phone,
  instagramHandle,
  whatsAppMessage,
  size = "sm",
  className = "",
  layout = "row",
}: ExternalMessageActionsProps) => {
  const { t } = useTranslation();
  const whatsAppUrl = phone ? buildWhatsAppUrl(phone, whatsAppMessage) : null;
  const instagramUrl = instagramHandle ? buildInstagramDmUrl(instagramHandle) : null;

  if (!whatsAppUrl && !instagramUrl) return null;

  return (
    <div className={`flex gap-2 ${layout === "column" ? "flex-col" : "flex-wrap items-center"} ${className}`}>
      {whatsAppUrl ? (
        <Button size={size} variant="outline" className="gap-1.5 text-xs h-8" asChild>
          <a href={whatsAppUrl} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-3.5 w-3.5 text-emerald-400" />
            {t("messaging.whatsapp")}
          </a>
        </Button>
      ) : null}
      {instagramUrl ? (
        <Button size={size} variant="outline" className="gap-1.5 text-xs h-8" asChild>
          <a href={instagramUrl} target="_blank" rel="noopener noreferrer">
            <Instagram className="h-3.5 w-3.5 text-pink-400" />
            {t("messaging.instagram")}
          </a>
        </Button>
      ) : null}
    </div>
  );
};

export default ExternalMessageActions;

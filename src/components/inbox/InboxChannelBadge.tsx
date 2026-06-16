import { Mail, MessageSquare, Instagram, Facebook, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { InboxChannel } from "@/lib/inboxPlan";

const CHANNEL_STYLE: Record<InboxChannel, { labelKey: string; className: string; icon: typeof Mail }> = {
  email: { labelKey: "messaging.email", className: "bg-primary/15 text-primary", icon: Mail },
  whatsapp: { labelKey: "messaging.whatsapp", className: "bg-emerald-500/15 text-emerald-400", icon: MessageSquare },
  instagram: { labelKey: "messaging.instagram", className: "bg-pink-500/15 text-pink-400", icon: Instagram },
  facebook: { labelKey: "messaging.facebook", className: "bg-blue-500/15 text-blue-400", icon: Facebook },
  sms: { labelKey: "messaging.sms", className: "bg-muted text-muted-foreground", icon: Phone },
};

export default function InboxChannelBadge({ channel }: { channel: string }) {
  const { t } = useTranslation();
  const key = channel.toLowerCase() as InboxChannel;
  const style = CHANNEL_STYLE[key] ?? CHANNEL_STYLE.email;
  const Icon = style.icon;
  return (
    <Badge variant="outline" className={`gap-1 text-[10px] font-medium ${style.className}`}>
      <Icon className="h-3 w-3" />
      {t(style.labelKey)}
    </Badge>
  );
}

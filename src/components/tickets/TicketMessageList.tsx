import { format, parseISO } from "date-fns";
import type { RefObject } from "react";
import { CheckCircle2, ImagePlus, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { SupportTicketMessageRow } from "@/lib/supportTickets";
import { TICKET_MEDIA_MAX_PER_USER } from "@/lib/ticketMedia";

type Props = {
  messages: SupportTicketMessageRow[];
  mediaUrls: Record<string, string>;
  userId: string | undefined;
  customerId: string;
  profileNames: Record<string, string>;
  replyText: string;
  onReplyChange: (value: string) => void;
  onSendReply: () => void;
  onUpload: (file: File) => void;
  onClose?: () => void;
  sending: boolean;
  uploading: boolean;
  closing?: boolean;
  isOpen: boolean;
  imagesUsed: number;
  showClose?: boolean;
  compact?: boolean;
  messagesEndRef?: RefObject<HTMLDivElement | null>;
};

export default function TicketMessageList({
  messages,
  mediaUrls,
  userId,
  customerId,
  profileNames,
  replyText,
  onReplyChange,
  onSendReply,
  onUpload,
  onClose,
  sending,
  uploading,
  closing,
  isOpen,
  imagesUsed,
  showClose,
  compact,
  messagesEndRef,
}: Props) {
  const { t } = useTranslation();
  const imagesRemaining = Math.max(0, TICKET_MEDIA_MAX_PER_USER - imagesUsed);
  const canUpload = isOpen && imagesRemaining > 0 && !uploading;

  return (
    <div className={`flex flex-col ${compact ? "" : "flex-1 min-h-0"}`}>
      <div className={`space-y-2 overflow-y-auto ${compact ? "max-h-80 p-3" : "flex-1 p-4 min-h-0"}`}>
        {messages.map((m) => {
          const mediaUrl = mediaUrls[m.id];
          const isMedia = m.message_type === "media" || !!mediaUrl;
          return (
            <div
              key={m.id}
              className={`rounded-md px-3 py-2 text-sm ${
                m.sender_id === userId ? (compact ? "bg-primary/15 ml-6" : "ml-8 bg-primary/15") : compact ? "bg-secondary mr-6" : "mr-8 bg-secondary"
              }`}
            >
              {!compact ? (
                <p className="text-[10px] font-medium text-muted-foreground mb-1">
                  {profileNames[m.sender_id] || (m.sender_id === customerId ? t("tickets.customer") : t("tickets.staff"))}
                </p>
              ) : null}
              {mediaUrl ? (
                <a href={mediaUrl} target="_blank" rel="noreferrer" className="block mb-2">
                  <img
                    src={mediaUrl}
                    alt={t("tickets.imageAlt")}
                    loading="lazy"
                    className="max-w-full max-h-56 rounded-md object-cover border border-border/60"
                  />
                </a>
              ) : null}
              {!isMedia ? <p className="whitespace-pre-wrap">{m.body}</p> : null}
              {isMedia && !mediaUrl ? <p className="text-muted-foreground italic">{t("tickets.imageUnavailable")}</p> : null}
              <p className="mt-1 text-[10px] text-muted-foreground">{format(parseISO(m.created_at), "d MMM · HH:mm")}</p>
            </div>
          );
        })}
        {messagesEndRef ? <div ref={messagesEndRef} /> : null}
      </div>

      {isOpen ? (
        <div className="border-t border-border/60 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>{t("tickets.imagesRemaining", { count: imagesRemaining, max: TICKET_MEDIA_MAX_PER_USER })}</span>
            {showClose && onClose ? (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" disabled={closing} onClick={onClose}>
                {closing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {t("tickets.closeTicket")}
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2 items-end">
            <label className={canUpload ? "cursor-pointer shrink-0" : "cursor-not-allowed shrink-0 opacity-50"}>
              <input
                type="file"
                className="hidden"
                accept="image/*"
                disabled={!canUpload}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                  e.currentTarget.value = "";
                }}
              />
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/60">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              </span>
            </label>
            <Textarea
              value={replyText}
              onChange={(e) => onReplyChange(e.target.value)}
              placeholder={t("tickets.replyPlaceholder")}
              rows={compact ? 3 : 3}
              className="resize-none flex-1"
            />
          </div>
          <Button variant="gold" size="sm" disabled={sending || !replyText.trim()} onClick={onSendReply}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("tickets.sendReply")}
          </Button>
        </div>
      ) : (
        <p className="border-t border-border/60 p-3 text-xs text-muted-foreground">{t("tickets.closedHint")}</p>
      )}
    </div>
  );
}

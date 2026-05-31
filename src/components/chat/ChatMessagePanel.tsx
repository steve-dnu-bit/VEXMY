import { Archive, Calendar, FileSignature, ImagePlus, PoundSterling, Send } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import ExternalMessageActions from "@/components/messaging/ExternalMessageActions";
import type { Thread, MessageRow } from "./UnifiedChatWorkspace";
import type { ThreadBookingContext } from "@/lib/chatThreadContext";
import type { QuickReply } from "@/lib/chatQuickReplies";

export type MessageMediaPreview = {
  url: string;
  caption: string | null;
};

export interface ChatMessagePanelProps {
  mode: "staff" | "customer";
  activeThread: Thread | null;
  labelForThread: (thread: Thread) => string;
  typingUsers: string[];
  selectedThreadId: string | null;
  onArchive: () => void;
  messages: MessageRow[];
  mediaByMessageId: Record<string, MessageMediaPreview>;
  userId: string | undefined;
  otherLastReadAt: number;
  messageText: string;
  onMessageChange: (value: string) => void;
  sending: boolean;
  uploading: boolean;
  onSend: () => void;
  onUpload: (file: File) => void;
  bookingContext: ThreadBookingContext | null;
  quickReplies: QuickReply[];
  onQuickReply: (text: string) => void;
}

const ChatMessagePanel = ({
  mode,
  activeThread,
  labelForThread,
  typingUsers,
  selectedThreadId,
  onArchive,
  messages,
  mediaByMessageId,
  userId,
  otherLastReadAt,
  messageText,
  onMessageChange,
  sending,
  uploading,
  onSend,
  onUpload,
  bookingContext,
  quickReplies,
  onQuickReply,
}: ChatMessagePanelProps) => {
  const { t } = useTranslation();

  const booking = bookingContext?.booking ?? null;

  return (
    <div className="border rounded-lg bg-card flex flex-col relative z-10 min-h-0">
      <div className="p-3 border-b space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">
              {activeThread ? labelForThread(activeThread) : t("chat.selectChat")}
            </p>
            {typingUsers.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {typingUsers.join(", ")} {t("chat.typing")}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{t("chat.autoEmailNote")}</p>
            )}
          </div>
          {activeThread ? (
            <Button variant="outline" size="sm" className="gap-1 shrink-0" onClick={onArchive}>
              <Archive className="h-3.5 w-3.5" /> {t("chat.archive")}
            </Button>
          ) : null}
        </div>

        {mode === "staff" && activeThread && bookingContext ? (
          <div className="rounded-md border border-border bg-secondary/30 p-2.5 space-y-2">
            {booking ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  {format(parseISO(booking.starts_at), "EEE d MMM, h:mm a")}
                </span>
                <Badge variant={booking.deposit_paid ? "default" : "outline"} className="text-[10px] h-5 gap-1">
                  <PoundSterling className="h-3 w-3" />
                  {booking.deposit_paid ? t("chat.depositPaid") : t("chat.depositPending")}
                </Badge>
                <Badge variant={bookingContext.hasConsent ? "default" : "outline"} className="text-[10px] h-5 gap-1">
                  <FileSignature className="h-3 w-3" />
                  {bookingContext.hasConsent ? t("chat.consentSigned") : t("chat.consentPending")}
                </Badge>
                {booking.tattoo_style ? (
                  <span className="text-muted-foreground truncate">{booking.tattoo_style}</span>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t("chat.noUpcomingBooking")}</p>
            )}
            {bookingContext.customerPhone ? (
              <ExternalMessageActions
                phone={bookingContext.customerPhone}
                whatsAppMessage={t("chat.whatsAppPrefill", { name: bookingContext.customerName })}
                layout="row"
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {messages.map((m) => {
          const media = m.message_type === "media" ? mediaByMessageId[m.id] : null;
          return (
            <div
              key={m.id}
              className={`rounded-md px-3 py-2 text-sm ${m.sender_id === userId ? "bg-primary/15 ml-10" : "bg-secondary mr-10"}`}
            >
              {media?.url ? (
                <a href={media.url} target="_blank" rel="noreferrer" className="block mb-2">
                  <img
                    src={media.url}
                    alt={media.caption || m.body || t("chat.chatMediaAlt")}
                    loading="lazy"
                    className="max-w-full max-h-56 rounded-md object-cover border border-border/60"
                  />
                </a>
              ) : null}
              {m.body && (!media || m.body !== media.caption) ? <p className="whitespace-pre-wrap">{m.body}</p> : null}
              <p className="text-[10px] text-muted-foreground mt-1">
                {new Date(m.created_at).toLocaleTimeString()}
                {m.sender_id === userId
                  ? ` · ${new Date(m.created_at).getTime() <= otherLastReadAt ? t("chat.read") : t("chat.sent")}`
                  : ""}
              </p>
            </div>
          );
        })}
      </div>

      {mode === "staff" && quickReplies.length > 0 ? (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5 border-t border-border/60 pt-2">
          {quickReplies.map((reply) => (
            <Button
              key={reply.id}
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 text-[11px] px-2"
              onClick={() => onQuickReply(reply.text)}
              disabled={!selectedThreadId || sending}
            >
              {reply.label}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="p-3 border-t flex gap-2 items-center">
        <label className="cursor-pointer">
          <input
            type="file"
            className="hidden"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
              e.currentTarget.value = "";
            }}
          />
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border">
            <ImagePlus className="h-4 w-4" />
          </span>
        </label>
        <Input value={messageText} onChange={(e) => onMessageChange(e.target.value)} placeholder={t("chat.typeMessage")} />
        <Button size="icon" onClick={onSend} disabled={sending || uploading}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default ChatMessagePanel;

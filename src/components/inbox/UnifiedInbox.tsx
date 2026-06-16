import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2, RefreshCw, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import { useInboxPlan } from "@/hooks/useInboxPlan";
import { INBOX_CHANNELS, type InboxChannel } from "@/lib/inboxPlan";
import InboxChannelBadge from "@/components/inbox/InboxChannelBadge";
import InboxUsageMeter from "@/components/inbox/InboxUsageMeter";
import ChannelConnections from "@/components/inbox/ChannelConnections";

export type InboxMessageRow = {
  id: string;
  channel: string;
  sender_name: string;
  sender_id: string | null;
  message_text: string;
  direction: string;
  is_read: boolean | null;
  created_at: string;
  organization_id: string | null;
};

function threadKey(row: Pick<InboxMessageRow, "channel" | "sender_id" | "sender_name">): string {
  return `${row.channel}:${row.sender_id || row.sender_name}`;
}

type UnifiedInboxProps = {
  highlightSenderId?: string;
};

export default function UnifiedInbox({ highlightSenderId }: UnifiedInboxProps) {
  const { t } = useTranslation();
  const { organizationId, usage, usageLoading, refreshUsage, limits, canUseChannel } = useInboxPlan();
  const [messages, setMessages] = useState<InboxMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelFilter, setChannelFilter] = useState<InboxChannel | "all">("all");
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const fetchMessages = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("messages")
      .select("id, channel, sender_name, sender_id, message_text, direction, is_read, created_at, organization_id")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    setMessages((data as InboxMessageRow[]) || []);
    setLoading(false);
    void refreshUsage();
  }, [organizationId, refreshUsage, t]);

  useEffect(() => {
    void fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (!highlightSenderId || messages.length === 0) return;
    const match = messages.find((m) => m.sender_id === highlightSenderId);
    if (match) setSelectedThread(threadKey(match));
  }, [highlightSenderId, messages]);

  const threads = useMemo(() => {
    const map = new Map<
      string,
      { key: string; channel: string; senderName: string; senderId: string | null; preview: string; at: string; unread: number }
    >();
    for (const m of messages) {
      if (channelFilter !== "all" && m.channel !== channelFilter) continue;
      const key = threadKey(m);
      const existing = map.get(key);
      const unread = m.is_read ? 0 : m.direction === "inbound" ? 1 : 0;
      if (!existing) {
        map.set(key, {
          key,
          channel: m.channel,
          senderName: m.sender_name,
          senderId: m.sender_id,
          preview: m.message_text.slice(0, 120),
          at: m.created_at,
          unread,
        });
      } else {
        existing.unread += unread;
      }
    }
    return [...map.values()].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [messages, channelFilter]);

  const threadMessages = useMemo(() => {
    if (!selectedThread) return [];
    return messages
      .filter((m) => threadKey(m) === selectedThread)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [messages, selectedThread]);

  const selectedMeta = threads.find((th) => th.key === selectedThread) ?? null;

  const markThreadRead = async (key: string) => {
    const rows = messages.filter((m) => threadKey(m) === key && !m.is_read && m.direction === "inbound");
    if (rows.length === 0) return;
    const ids = rows.map((r) => r.id);
    const { error } = await supabase.from("messages").update({ is_read: true }).in("id", ids);
    if (error) {
      toast({ title: t("unifiedInbox.markReadFailed"), description: error.message, variant: "destructive" });
      return;
    }
    setMessages((prev) => prev.map((m) => (ids.includes(m.id) ? { ...m, is_read: true } : m)));
  };

  const handleSelectThread = (key: string) => {
    setSelectedThread(key);
    void markThreadRead(key);
  };

  const handleSendReply = async () => {
    if (!selectedMeta || !replyText.trim() || !organizationId) return;
    if (!selectedMeta.senderId) {
      toast({ title: t("unifiedInbox.replyFailed"), variant: "destructive" });
      return;
    }

    const channel = selectedMeta.channel as InboxChannel;
    const canReply = channel === "email" || ["whatsapp", "sms", "instagram", "facebook"].includes(channel);
    if (!canReply) {
      toast({ title: t("unifiedInbox.replyFailed") });
      return;
    }

    const atCap =
      usage &&
      usage.monthlyCap > 0 &&
      usage.remaining <= 0 &&
      !usage.inOverage &&
      usage.overageRateGbp <= 0;
    if (atCap) {
      toast({ title: t("unifiedInbox.capReached"), variant: "destructive" });
      return;
    }

    setSending(true);
    const { error } = await invokeEdgeFunctionJson("send-inbox-reply", {
      organizationId,
      channel,
      recipient: selectedMeta.senderId,
      recipientName: selectedMeta.senderName,
      body: replyText.trim(),
    });
    setSending(false);
    if (error) {
      toast({ title: t("unifiedInbox.replyFailed"), description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: t("unifiedInbox.replySent") });
    setReplyText("");
    await fetchMessages();
  };

  const channelTabs: Array<InboxChannel | "all"> = [
    "all",
    ...INBOX_CHANNELS.filter((c) => canUseChannel(c)),
  ];

  const replySupported = selectedMeta
    ? selectedMeta.channel === "email" ||
      ["whatsapp", "sms", "instagram", "facebook"].includes(selectedMeta.channel)
    : false;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">{t("unifiedInbox.title")}</h2>
          {!usageLoading && (
            <div className="mt-2 max-w-xs">
              <InboxUsageMeter usage={usage} />
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void fetchMessages()} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {t("unifiedInbox.refresh")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings className="mr-1 h-4 w-4" />
            {t("unifiedInbox.connectChannels")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {channelTabs.map((ch) => (
          <Button
            key={ch}
            size="sm"
            variant={channelFilter === ch ? "default" : "outline"}
            onClick={() => setChannelFilter(ch)}
          >
            {ch === "all" ? t("unifiedInbox.allChannels") : ch}
          </Button>
        ))}
      </div>

      <div className="grid min-h-[420px] gap-4 lg:grid-cols-[280px_1fr]">
        <div className="rounded-lg border border-border/70 bg-card/40 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : threads.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t("unifiedInbox.noMessages")}</p>
          ) : (
            <ul className="divide-y divide-border/60 max-h-[520px] overflow-y-auto">
              {threads.map((th) => (
                <li key={th.key}>
                  <button
                    type="button"
                    onClick={() => handleSelectThread(th.key)}
                    className={`w-full text-left p-3 hover:bg-muted/40 ${selectedThread === th.key ? "bg-muted/50" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{th.senderName}</span>
                      <InboxChannelBadge channel={th.channel} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-1">{th.preview}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(th.at), { addSuffix: true })}
                      {th.unread > 0 ? ` · ${th.unread} new` : ""}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-border/70 bg-card/40 flex flex-col min-h-[420px]">
          {!selectedMeta ? (
            <p className="m-auto text-sm text-muted-foreground p-6">{t("unifiedInbox.selectThread")}</p>
          ) : (
            <>
              <div className="border-b border-border/60 p-3">
                <p className="font-medium">{selectedMeta.senderName}</p>
                <p className="text-xs text-muted-foreground">{selectedMeta.senderId || "—"}</p>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {threadMessages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      m.direction === "outbound" ? "ml-auto bg-gold/15" : "bg-muted/50"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.message_text}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {m.direction === "inbound" ? t("unifiedInbox.inbound") : t("unifiedInbox.outbound")} ·{" "}
                      {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                    </p>
                  </div>
                ))}
              </div>
              {replySupported ? (
                <div className="border-t border-border/60 p-3 space-y-2">
                  <Textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={t("unifiedInbox.replyPlaceholder")}
                    rows={3}
                  />
                  <Button
                    variant="gold"
                    size="sm"
                    disabled={sending || !replyText.trim()}
                    onClick={() => void handleSendReply()}
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("unifiedInbox.sendReply")}
                  </Button>
                </div>
              ) : (
                <p className="border-t border-border/60 p-3 text-xs text-muted-foreground">{t("unifiedInbox.emailOnlyReply")}</p>
              )}
            </>
          )}
        </div>
      </div>

      <ChannelConnections open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

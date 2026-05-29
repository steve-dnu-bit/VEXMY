import { Archive, ImagePlus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Thread, MessageRow } from "./UnifiedChatWorkspace";

export interface ChatMessagePanelProps {
  activeThread: Thread | null;
  labelForThread: (thread: Thread) => string;
  typingUsers: string[];
  selectedThreadId: string | null;
  emailNotifying: boolean;
  onSendEmailUpdate: () => void;
  onArchive: () => void;
  messages: MessageRow[];
  userId: string | undefined;
  otherLastReadAt: number;
  messageText: string;
  onMessageChange: (value: string) => void;
  sending: boolean;
  uploading: boolean;
  onSend: () => void;
  onUpload: (file: File) => void;
}

const ChatMessagePanel = ({
  activeThread,
  labelForThread,
  typingUsers,
  selectedThreadId,
  emailNotifying,
  onSendEmailUpdate,
  onArchive,
  messages,
  userId,
  otherLastReadAt,
  messageText,
  onMessageChange,
  sending,
  uploading,
  onSend,
  onUpload,
}: ChatMessagePanelProps) => (
  <div className="border rounded-lg bg-card flex flex-col relative z-10">
    <div className="p-3 border-b flex items-center justify-between gap-2">
      <div>
        <p className="text-sm font-semibold">{activeThread ? labelForThread(activeThread) : "Select chat"}</p>
        {typingUsers.length > 0 ? (
          <p className="text-xs text-muted-foreground">{typingUsers.join(", ")} typing...</p>
        ) : null}
      </div>
      {activeThread ? (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onSendEmailUpdate}
            disabled={!selectedThreadId || emailNotifying}
            className="h-8 text-xs"
          >
            {emailNotifying ? "Sending email..." : "Notify by email"}
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={onArchive}>
            <Archive className="h-3.5 w-3.5" /> Archive
          </Button>
        </div>
      ) : null}
    </div>
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {messages.map((m) => (
        <div key={m.id} className={`rounded-md px-3 py-2 text-sm ${m.sender_id === userId ? "bg-primary/15 ml-10" : "bg-secondary mr-10"}`}>
          <p>{m.body}</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {new Date(m.created_at).toLocaleTimeString()}
            {m.sender_id === userId ? ` · ${new Date(m.created_at).getTime() <= otherLastReadAt ? "Read" : "Sent"}` : ""}
          </p>
        </div>
      ))}
    </div>
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
      <Input
        value={messageText}
        onChange={(e) => onMessageChange(e.target.value)}
        placeholder="Type message..."
      />
      <Button size="icon" onClick={onSend} disabled={sending || uploading}>
        <Send className="h-4 w-4" />
      </Button>
    </div>
  </div>
);

export default ChatMessagePanel;

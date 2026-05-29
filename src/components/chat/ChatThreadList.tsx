import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  Thread,
  MessageRow,
  ArtistOption,
  CustomerOption,
} from "./UnifiedChatWorkspace";

export interface ChatThreadListProps {
  mode: "staff" | "customer";
  threads: Thread[];
  selectedThreadId: string | null;
  setSelectedThreadId: (id: string) => void;
  latestByThread: Record<string, MessageRow | null>;
  unreadByThread: Record<string, number>;
  labelForThread: (thread: Thread) => string;
  notificationSupported: boolean;
  notificationPermission: NotificationPermission;
  requestBrowserNotifications: () => void;
  artists: ArtistOption[];
  selectedArtistId: string;
  setSelectedArtistId: (id: string) => void;
  customers: CustomerOption[];
  selectedCustomerId: string;
  setSelectedCustomerId: (id: string) => void;
  handleStartStaffChat: () => void;
}

const ChatThreadList = ({
  mode,
  threads,
  selectedThreadId,
  setSelectedThreadId,
  latestByThread,
  unreadByThread,
  labelForThread,
  notificationSupported,
  notificationPermission,
  requestBrowserNotifications,
  artists,
  selectedArtistId,
  setSelectedArtistId,
  customers,
  selectedCustomerId,
  setSelectedCustomerId,
  handleStartStaffChat,
}: ChatThreadListProps) => (
  <div className="border rounded-lg bg-card overflow-y-auto relative z-20">
    <div className="p-3 border-b">
      <p className="font-semibold text-sm">{mode === "staff" ? "Customer chats" : "Your chats"}</p>
      {notificationSupported && notificationPermission !== "granted" ? (
        <Button
          size="sm"
          variant="outline"
          className="mt-3 w-full h-8 text-xs gap-1"
          onClick={requestBrowserNotifications}
        >
          <Bell className="h-3.5 w-3.5" />
          Enable notifications
        </Button>
      ) : null}
      {mode === "customer" ? (
        <div className="mt-3 space-y-2">
          <Label className="text-xs">Start chat with artist</Label>
          <Select value={selectedArtistId} onValueChange={setSelectedArtistId}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Choose artist" />
            </SelectTrigger>
            <SelectContent className="z-[70]">
              {artists.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <Label className="text-xs">Start chat with customer</Label>
          <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Choose customer" />
            </SelectTrigger>
            <SelectContent className="z-[70]">
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={handleStartStaffChat}>
            Start chat
          </Button>
        </div>
      )}
    </div>
    {threads.length === 0 ? (
      <p className="p-3 text-xs text-muted-foreground">No chats yet.</p>
    ) : (
      threads.map((t) => {
        const label = labelForThread(t);
        const preview = latestByThread[t.id]?.body || "No messages yet";
        const unread = unreadByThread[t.id] || 0;
        return (
          <button
            key={t.id}
            onClick={() => setSelectedThreadId(t.id)}
            className={`w-full text-left p-3 border-b text-xs hover:bg-secondary ${selectedThreadId === t.id ? "bg-secondary" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium truncate">{label}</p>
              {unread > 0 ? <span className="rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-[10px]">{unread}</span> : null}
            </div>
            <p className="text-muted-foreground truncate">{preview}</p>
            <p className="text-muted-foreground">{new Date(t.last_message_at || t.created_at).toLocaleString()}</p>
          </button>
        );
      })
    )}
  </div>
);

export default ChatThreadList;

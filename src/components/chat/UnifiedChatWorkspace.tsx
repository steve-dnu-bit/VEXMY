import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { toast } from "sonner";
import { buildStaffQuickReplies } from "@/lib/chatQuickReplies";
import { fetchThreadBookingContext, type ThreadBookingContext } from "@/lib/chatThreadContext";
import { useTranslation } from "react-i18next";
import { filterUserIdsByOrganization, loadOrganizationCustomerIds, loadOrganizationMemberIds } from "@/lib/organizationMembers";
import ChatThreadList from "./ChatThreadList";
import ChatMessagePanel, { type MessageMediaPreview } from "./ChatMessagePanel";
import ChatGalleryPanel from "./ChatGalleryPanel";

export type Thread = {
  id: string;
  artist_id: string;
  customer_id: string;
  last_message_at: string | null;
  created_at: string;
  archived_by_artist?: boolean;
  archived_by_customer?: boolean;
};

export type MessageRow = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  message_type: "text" | "media" | "system";
  created_at: string;
};

export type MediaRow = {
  id: string;
  thread_id: string;
  message_id: string | null;
  storage_path: string;
  caption: string | null;
  created_at: string;
};

export type ArtistOption = {
  id: string;
  name: string;
};

export type CustomerOption = {
  id: string;
  name: string;
};

type MemberRow = {
  thread_id: string;
  user_id: string;
  role: "artist" | "customer";
  last_read_at: string | null;
};

type TypingRow = {
  thread_id: string;
  user_id: string;
  expires_at: string;
};

interface Props {
  mode: "staff" | "customer";
  initialCustomerId?: string;
}

const UnifiedChatWorkspace = ({ mode, initialCustomerId }: Props) => {
  const { user } = useAuth();
  const { roles } = useUserRoles();
  const { t } = useTranslation();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [gallery, setGallery] = useState<MediaRow[]>([]);
  const [latestByThread, setLatestByThread] = useState<Record<string, MessageRow | null>>({});
  const [membersByThread, setMembersByThread] = useState<Record<string, MemberRow[]>>({});
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [unreadByThread, setUnreadByThread] = useState<Record<string, number>>({});
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [pinsByMedia, setPinsByMedia] = useState<Record<string, boolean>>({});
  const [messageText, setMessageText] = useState("");
  const [artists, setArtists] = useState<ArtistOption[]>([]);
  const [selectedArtistId, setSelectedArtistId] = useState<string>("");
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [mediaByMessageId, setMediaByMessageId] = useState<Record<string, MessageMediaPreview>>({});
  const [bookingContext, setBookingContext] = useState<ThreadBookingContext | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const notifiedMessageIdsRef = useRef<Set<string>>(new Set());
  const [notificationSupported, setNotificationSupported] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const latestThreadsRef = useRef<Thread[]>([]);
  const selectedThreadRef = useRef<string | null>(null);

  const threadMap = useMemo(() => new Map(threads.map((t) => [t.id, t])), [threads]);

  const labelForThread = (thread: Thread): string => {
    if (!user) return t("chat.threadLabelFallback");
    const otherId = mode === "staff" ? thread.customer_id : thread.artist_id;
    const name = profileNames[otherId]?.trim();
    if (name) return name;
    return mode === "staff" ? t("chat.customerFallback") : t("chat.artistFallback");
  };

  const resolveProfileNamesForThreads = async (rows: Thread[]): Promise<Record<string, string>> => {
    const userIds = [...new Set(rows.flatMap((r) => [r.artist_id, r.customer_id]))];
    if (userIds.length === 0) return {};

    const { data: profiles } = await supabase.from("profiles").select("user_id, display_name").in("user_id", userIds);
    const names: Record<string, string> = {};
    (profiles || []).forEach((p: any) => {
      const name = (p.display_name || "").trim();
      if (name) names[p.user_id] = name;
    });

    if (mode === "staff") {
      const missingCustomerIds = [...new Set(rows.map((r) => r.customer_id).filter((id) => !names[id]))];
      if (missingCustomerIds.length > 0) {
        const { data: bookings } = await supabase
          .from("bookings")
          .select("client_user_id, client_name")
          .in("client_user_id", missingCustomerIds);
        (bookings || []).forEach((b: any) => {
          const id = b.client_user_id as string | null;
          const clientName = (b.client_name || "").trim();
          if (id && clientName && !names[id]) names[id] = clientName;
        });
      }
    }

    return names;
  };

  const refreshThreadMeta = async (rows: Thread[]) => {
    if (!user || rows.length === 0) {
      setLatestByThread({});
      setMembersByThread({});
      setUnreadByThread({});
      return;
    }
    const ids = rows.map((r) => r.id);

    const [{ data: memberRows }, { data: msgRows }] = await Promise.all([
      supabase.from("chat_members" as any).select("thread_id, user_id, role, last_read_at").in("thread_id", ids),
      supabase.from("chat_messages" as any).select("id, thread_id, sender_id, body, message_type, created_at").in("thread_id", ids).order("created_at", { ascending: false }),
    ]);

    const groupedMembers: Record<string, MemberRow[]> = {};
    (memberRows || []).forEach((m: any) => {
      if (!groupedMembers[m.thread_id]) groupedMembers[m.thread_id] = [];
      groupedMembers[m.thread_id].push(m as MemberRow);
    });
    setMembersByThread(groupedMembers);

    const latest: Record<string, MessageRow | null> = {};
    const unread: Record<string, number> = {};
    const lastReadByThread: Record<string, string | null> = {};
    rows.forEach((r) => {
      const own = (groupedMembers[r.id] || []).find((m) => m.user_id === user.id);
      lastReadByThread[r.id] = own?.last_read_at || null;
      unread[r.id] = 0;
      latest[r.id] = null;
    });
    (msgRows || []).forEach((m: any) => {
      if (!latest[m.thread_id]) latest[m.thread_id] = m as MessageRow;
      if (m.sender_id !== user.id) {
        const lastRead = lastReadByThread[m.thread_id];
        if (!lastRead || new Date(m.created_at).getTime() > new Date(lastRead).getTime()) unread[m.thread_id] += 1;
      }
    });
    setLatestByThread(latest);
    setUnreadByThread(unread);
  };

  const fetchThreads = async () => {
    if (!user) return;
    const col = mode === "staff" ? "artist_id" : "customer_id";
    const { data } = await supabase
      .from("chat_threads" as any)
      .select("id, artist_id, customer_id, last_message_at, created_at, archived_by_artist, archived_by_customer")
      .eq(col, user.id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    const rows = ((data || []) as Thread[]).filter((r) =>
      mode === "staff" ? !r.archived_by_artist : !r.archived_by_customer,
    );
    const names = await resolveProfileNamesForThreads(rows);
    setProfileNames(names);
    setThreads(rows);
    if (!selectedThreadId && rows.length > 0) setSelectedThreadId(rows[0].id);
    if (selectedThreadId && !rows.some((r) => r.id === selectedThreadId)) setSelectedThreadId(rows[0]?.id || null);
    await refreshThreadMeta(rows);
  };

  const fetchArtists = async () => {
    if (!user || mode !== "customer") return;
    const orgMemberIds = await loadOrganizationMemberIds();
    const [{ data: roleRows }, { data: profileRows }] = await Promise.all([
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("profiles").select("user_id, display_name, public_profile_completed, customer_profile_completed"),
    ]);
    const rolesByUser = new Map<string, string[]>();
    (roleRows || []).forEach((r: any) => {
      const existing = rolesByUser.get(r.user_id) || [];
      existing.push(r.role);
      rolesByUser.set(r.user_id, existing);
    });
    const staffIds = ((profileRows || []) as any[])
      .map((p) => p.user_id as string)
      .filter((id) => {
        const roles = rolesByUser.get(id) || [];
        const profile = ((profileRows || []) as any[]).find((p) => p.user_id === id);
        const hasArtistRole = roles.includes("artist");
        const looksLikePublicArtistProfile = profile?.public_profile_completed === true;
        // Keep artist-role users and public artist profiles; never include customer-only accounts.
        if (!(hasArtistRole || looksLikePublicArtistProfile)) return false;
        if (roles.length === 1 && roles[0] === "customer") return false;
        if (!hasArtistRole && profile?.customer_profile_completed === true) return false;
        return true;
      });
    const uniqueStaffIds = filterUserIdsByOrganization([...new Set(staffIds)], orgMemberIds);
    if (uniqueStaffIds.length === 0) {
      setArtists([]);
      return;
    }
    const profilesById = new Map<string, any>(((profileRows || []) as any[]).map((p: any) => [p.user_id, p]));
    const list = uniqueStaffIds
      .filter((id) => id !== user.id)
      .map((id) => ({
        id,
        name: profilesById.get(id)?.display_name || t("chat.artistFallback"),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    setArtists(list);
  };

  const fetchCustomers = async () => {
    if (!user || mode !== "staff") return;
    const byId = new Map<string, CustomerOption>();

    const orgMemberIds = await loadOrganizationMemberIds();
    let customerIds: string[];
    if (orgMemberIds) {
      customerIds = [...(await loadOrganizationCustomerIds())];
    } else {
      const { data: roleRows } = await supabase.from("user_roles").select("user_id, role").eq("role", "customer");
      customerIds = [...new Set((roleRows || []).map((r: any) => r.user_id).filter(Boolean))] as string[];
    }

    if (customerIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("user_id, display_name").in("user_id", customerIds);
      (profiles || []).forEach((p: any) => {
        const name = (p.display_name || "").trim();
        if (!name) return;
        byId.set(p.user_id, { id: p.user_id, name });
      });
    }

    const isAdmin = roles.includes("admin");
    let bookingQuery = supabase.from("bookings").select("client_user_id, client_name").not("client_user_id", "is", null);
    if (!isAdmin) {
      bookingQuery = bookingQuery.eq("artist_id", user.id);
    }
    const { data: bookingLinks } = await bookingQuery;

    const bookingUserIds = [...new Set((bookingLinks || []).map((b: any) => b.client_user_id).filter(Boolean))] as string[];
    const missingProfileIds = bookingUserIds.filter((id) => !byId.has(id));

    if (missingProfileIds.length > 0) {
      const { data: linkedProfiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", missingProfileIds);
      (linkedProfiles || []).forEach((p: any) => {
        byId.set(p.user_id, { id: p.user_id, name: (p.display_name || "").trim() || p.user_id });
      });
    }

    (bookingLinks || []).forEach((b: any) => {
      if (!b.client_user_id || byId.has(b.client_user_id)) return;
      byId.set(b.client_user_id, {
        id: b.client_user_id,
        name: (b.client_name || "").trim() || b.client_user_id,
      });
    });

    setCustomers([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)));
  };

  const fetchThreadData = async (threadId: string) => {
    const [{ data: msgs }, { data: media }, { data: typingRows }, { data: pinnedRows }] = await Promise.all([
      supabase.from("chat_messages" as any).select("id, thread_id, sender_id, body, message_type, created_at").eq("thread_id", threadId).order("created_at"),
      supabase.from("chat_media" as any).select("id, thread_id, message_id, storage_path, caption, created_at").eq("thread_id", threadId).order("created_at", { ascending: false }),
      supabase.from("chat_typing_state" as any).select("thread_id, user_id, expires_at").eq("thread_id", threadId),
      supabase.from("chat_media_pins" as any).select("media_id, user_id").eq("thread_id", threadId).eq("user_id", user?.id || ""),
    ]);
    const msgRows = (msgs || []) as MessageRow[];
    const mediaRows = (media || []) as MediaRow[];
    const pins = (pinnedRows || []).reduce((acc: Record<string, boolean>, r: any) => {
      acc[r.media_id] = true;
      return acc;
    }, {});
    setPinsByMedia(pins);
    setMessages(msgRows);
    setGallery(
      [...mediaRows].sort((a, b) => {
        const ap = pins[a.id] ? 1 : 0;
        const bp = pins[b.id] ? 1 : 0;
        if (ap !== bp) return bp - ap;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }),
    );

    const activeTyping = ((typingRows || []) as TypingRow[])
      .filter((row) => row.user_id !== user?.id && new Date(row.expires_at).getTime() > Date.now())
      .map((row) => profileNames[row.user_id]?.trim() || t("chat.someone"));
    setTypingUsers(activeTyping);

    const urlEntries = await Promise.all(
      mediaRows.map(async (m) => {
        const { data } = await supabase.storage.from("chat-media").createSignedUrl(m.storage_path, 60 * 60);
        return [m.id, data?.signedUrl || ""] as const;
      }),
    );
    const urlMap = Object.fromEntries(urlEntries);
    setSignedUrls(urlMap);

    const inlineMedia: Record<string, MessageMediaPreview> = {};
    mediaRows.forEach((m) => {
      if (!m.message_id || !urlMap[m.id]) return;
      inlineMedia[m.message_id] = { url: urlMap[m.id], caption: m.caption };
    });
    setMediaByMessageId(inlineMedia);

    if (user) {
      await supabase
        .from("chat_members" as any)
        .update({ last_read_at: new Date().toISOString() } as any)
        .eq("thread_id", threadId)
        .eq("user_id", user.id);
    }
  };

  useEffect(() => {
    if (!user) return;
    void fetchThreads();
    void fetchArtists();
    void fetchCustomers();
  }, [user, mode, roles]);

  useEffect(() => {
    latestThreadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    selectedThreadRef.current = selectedThreadId;
  }, [selectedThreadId]);

  useEffect(() => {
    const supported = typeof window !== "undefined" && "Notification" in window;
    setNotificationSupported(supported);
    if (supported) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (!selectedThreadId) {
      setBookingContext(null);
      return;
    }
    void fetchThreadData(selectedThreadId);
    if (mode === "staff") {
      const thread = threads.find((t) => t.id === selectedThreadId);
      if (thread) {
        void fetchThreadBookingContext(supabase, thread).then(setBookingContext);
      } else {
        setBookingContext(null);
      }
    } else {
      setBookingContext(null);
    }

    const channel = supabase
      .channel(`chat-${selectedThreadId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `thread_id=eq.${selectedThreadId}` }, () => {
        void fetchThreadData(selectedThreadId);
        void fetchThreads();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_media", filter: `thread_id=eq.${selectedThreadId}` }, () => {
        void fetchThreadData(selectedThreadId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_typing_state", filter: `thread_id=eq.${selectedThreadId}` }, () => {
        void fetchThreadData(selectedThreadId);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedThreadId, mode, threads]);

  useEffect(() => {
    if (initialCustomerId && mode === "staff") {
      setSelectedCustomerId(initialCustomerId);
    }
  }, [initialCustomerId, mode]);

  useEffect(() => {
    if (!user || mode !== "staff" || !selectedCustomerId) return;
    void (async () => {
      const threadId = await ensureStaffThread(selectedCustomerId);
      if (threadId) setSelectedThreadId(threadId);
    })();
  }, [selectedCustomerId, user, mode]);

  useEffect(() => {
    if (!user || mode !== "customer" || !selectedArtistId) return;
    void (async () => {
      const threadId = await ensureCustomerThread(selectedArtistId);
      if (threadId) setSelectedThreadId(threadId);
    })();
  }, [selectedArtistId, user, mode]);

  const ensureCustomerThread = async (artistId?: string) => {
    if (!user || mode !== "customer") return null;
    const targetArtistId = artistId || selectedArtistId;
    if (!targetArtistId) return null;
    const existing = threads.find((t) => t.artist_id === targetArtistId && t.customer_id === user.id);
    if (existing) return existing.id;
    const { data: existingAny } = await supabase
      .from("chat_threads" as any)
      .select("id, archived_by_customer")
      .eq("artist_id", targetArtistId)
      .eq("customer_id", user.id)
      .maybeSingle();
    if (existingAny?.id) {
      if (existingAny.archived_by_customer) {
        await supabase.from("chat_threads" as any).update({ archived_by_customer: false } as any).eq("id", existingAny.id);
      }
      await fetchThreads();
      return existingAny.id as string;
    }
    const { data, error } = await supabase
      .from("chat_threads" as any)
      .insert({ artist_id: targetArtistId, customer_id: user.id, created_by: user.id } as any)
      .select("id")
      .single();
    if (error || !data?.id) {
      toast.error(error?.message || t("chat.startChatFailed"));
      return null;
    }
    await fetchThreads();
    return data.id as string;
  };

  const ensureStaffThread = async (customerId: string) => {
    if (!user || mode !== "staff") return null;
    const existing = threads.find((t) => t.artist_id === user.id && t.customer_id === customerId);
    if (existing) return existing.id;
    const { data: existingAny } = await supabase
      .from("chat_threads" as any)
      .select("id, archived_by_artist")
      .eq("artist_id", user.id)
      .eq("customer_id", customerId)
      .maybeSingle();
    if (existingAny?.id) {
      if (existingAny.archived_by_artist) {
        await supabase.from("chat_threads" as any).update({ archived_by_artist: false } as any).eq("id", existingAny.id);
      }
      await fetchThreads();
      return existingAny.id as string;
    }
    const { data, error } = await supabase
      .from("chat_threads" as any)
      .insert({ artist_id: user.id, customer_id: customerId, created_by: user.id } as any)
      .select("id")
      .single();
    if (error || !data?.id) {
      toast.error(error?.message || t("chat.startCustomerChatFailed"));
      return null;
    }
    await fetchThreads();
    return data.id as string;
  };

  const handleStartStaffChat = async () => {
    if (!selectedCustomerId) {
      toast.error(t("chat.chooseCustomerFirst"));
      return;
    }
    const threadId = await ensureStaffThread(selectedCustomerId);
    if (threadId) setSelectedThreadId(threadId);
  };

  const updateTypingState = async (threadId: string) => {
    if (!user) return;
    const expires = new Date(Date.now() + 20_000).toISOString();
    await supabase.from("chat_typing_state" as any).upsert({
      thread_id: threadId,
      user_id: user.id,
      expires_at: expires,
      updated_at: new Date().toISOString(),
    } as any);
  };

  const requestBrowserNotifications = async () => {
    if (!notificationSupported) {
      toast.error(t("chat.notificationsNotSupported"));
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === "granted") {
        toast.success(t("chat.notificationsEnabled"));
      } else {
        toast.error(t("chat.notificationsBlocked"));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t("chat.requestPermissionFailed");
      toast.error(message);
    }
  };

  const playIncomingSignal = () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate([120, 60, 120]);
      } catch {
        // Ignore vibration failures.
      }
    }
    if (typeof window === "undefined") return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    try {
      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.24);
      window.setTimeout(() => {
        void ctx.close();
      }, 350);
    } catch {
      // Ignore audio failures on restricted browsers.
    }
  };

  const notifyIncomingMessage = (message: MessageRow) => {
    if (!user || message.sender_id === user.id) return;
    if (!latestThreadsRef.current.some((t) => t.id === message.thread_id)) return;
    if (notifiedMessageIdsRef.current.has(message.id)) return;

    notifiedMessageIdsRef.current.add(message.id);
    playIncomingSignal();

    if (!notificationSupported || notificationPermission !== "granted") return;
    const senderLabel = profileNames[message.sender_id] || t("chat.someone");
    const notification = new Notification(t("chat.newMessageFrom", { name: senderLabel }), {
      body: message.body || t("chat.newMessageFallback"),
      tag: `chat-${message.thread_id}`,
      vibrate: [120, 60, 120],
    });
    notification.onclick = () => {
      window.focus();
      setSelectedThreadId(message.thread_id);
      notification.close();
    };
  };

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`chat-incoming-${user.id}`)
      // Limitation: postgres_changes does not support negative filters
      // (e.g. sender_id != user.id), so this listener receives INSERT events
      // for ALL chat_messages rows visible via RLS — including the current
      // user's own sends. notifyIncomingMessage() already guards against
      // self-notifications and unrelated threads, so correctness is fine, but
      // the channel is noisier than ideal. A server-side filter (e.g. Database
      // Webhook or a Postgres trigger publishing to a user-scoped topic) would
      // reduce unnecessary Realtime traffic.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
        const message = payload.new as MessageRow;
        notifyIncomingMessage(message);
        if (selectedThreadRef.current === message.thread_id) {
          void fetchThreadData(message.thread_id);
        }
        void fetchThreads();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, notificationSupported, notificationPermission, profileNames]);

  const handleSend = async () => {
    if (!user || !messageText.trim()) return;
    let threadId = selectedThreadId;
    if (!threadId && mode === "customer") {
      threadId = await ensureCustomerThread();
      if (threadId) setSelectedThreadId(threadId);
    }
    if (!threadId && mode === "staff") {
      if (!selectedCustomerId) {
        toast.error(t("chat.chooseCustomerFirst"));
        return;
      }
      threadId = await ensureStaffThread(selectedCustomerId);
      if (threadId) setSelectedThreadId(threadId);
    }
    if (!threadId) return;
    setSending(true);
    const { error } = await supabase.from("chat_messages" as any).insert({
      thread_id: threadId,
      sender_id: user.id,
      body: messageText.trim(),
      message_type: "text",
    } as any);
    setSending(false);
    if (error) {
      toast.error(error.message || t("chat.sendFailed"));
      return;
    }
    setMessageText("");
    if (user) {
      await supabase.from("chat_typing_state" as any).delete().eq("thread_id", threadId).eq("user_id", user.id);
    }
    await fetchThreadData(threadId);
    await fetchThreads();
  };

  const handleUpload = async (file: File) => {
    if (!user || !file) return;
    let threadId = selectedThreadId;
    if (!threadId && mode === "customer") {
      threadId = await ensureCustomerThread();
      if (threadId) setSelectedThreadId(threadId);
    }
    if (!threadId && mode === "staff") {
      if (!selectedCustomerId) {
        toast.error(t("chat.chooseCustomerFirst"));
        return;
      }
      threadId = await ensureStaffThread(selectedCustomerId);
      if (threadId) setSelectedThreadId(threadId);
    }
    if (!threadId) return;
    setUploading(true);
    const path = `${threadId}/${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
    const { error: upErr } = await supabase.storage.from("chat-media").upload(path, file, { upsert: false });
    if (upErr) {
      setUploading(false);
      toast.error(upErr.message || t("chat.uploadFailed"));
      return;
    }
    const { data: msgData, error: msgErr } = await supabase
      .from("chat_messages" as any)
      .insert({ thread_id: threadId, sender_id: user.id, body: file.name, message_type: "media" } as any)
      .select("id")
      .single();
    if (msgErr || !msgData?.id) {
      setUploading(false);
      toast.error(msgErr?.message || t("chat.createMediaMessageFailed"));
      return;
    }
    const { error: mediaErr } = await supabase.from("chat_media" as any).insert({
      thread_id: threadId,
      message_id: msgData.id,
      uploaded_by: user.id,
      storage_path: path,
      mime_type: file.type || null,
      size_bytes: file.size,
      caption: null,
    } as any);
    setUploading(false);
    if (mediaErr) {
      toast.error(mediaErr.message || t("chat.saveMediaFailed"));
      return;
    }
    await fetchThreadData(threadId);
    await fetchThreads();
  };

  const activeThread = selectedThreadId ? threadMap.get(selectedThreadId) || null : null;
  const activeMembers = selectedThreadId ? membersByThread[selectedThreadId] || [] : [];
  const otherMember = activeMembers.find((m) => m.user_id !== user?.id);
  const otherLastReadAt = otherMember?.last_read_at ? new Date(otherMember.last_read_at).getTime() : 0;

  const togglePin = async (mediaId: string) => {
    if (!user || !selectedThreadId) return;
    const isPinned = !!pinsByMedia[mediaId];
    if (isPinned) {
      await supabase.from("chat_media_pins" as any).delete().eq("media_id", mediaId).eq("user_id", user.id);
    } else {
      await supabase.from("chat_media_pins" as any).insert({ thread_id: selectedThreadId, media_id: mediaId, user_id: user.id } as any);
    }
    await fetchThreadData(selectedThreadId);
  };

  const archiveThread = async () => {
    if (!selectedThreadId) return;
    const field = mode === "staff" ? "archived_by_artist" : "archived_by_customer";
    const { error } = await supabase.from("chat_threads" as any).update({ [field]: true } as any).eq("id", selectedThreadId);
    if (error) {
      toast.error(error.message || t("chat.archiveFailed"));
      return;
    }
    toast.success(t("chat.chatArchived"));
    setSelectedThreadId(null);
    await fetchThreads();
  };

  const handleMessageChange = (value: string) => {
    setMessageText(value);
    if (selectedThreadId) {
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      void updateTypingState(selectedThreadId);
      typingTimerRef.current = window.setTimeout(() => {
        if (user) void supabase.from("chat_typing_state" as any).delete().eq("thread_id", selectedThreadId).eq("user_id", user.id);
      }, 3500);
    }
  };

  const handleQuickReply = (text: string) => {
    setMessageText(text);
  };

  const handleSelectThread = (threadId: string) => {
    setSelectedThreadId(threadId);
    if (mode === "staff") {
      const thread = threads.find((row) => row.id === threadId);
      if (thread) setSelectedCustomerId(thread.customer_id);
    }
  };

  const quickReplies = useMemo(() => {
    if (mode !== "staff" || !bookingContext) return [];
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return buildStaffQuickReplies(bookingContext, origin, t);
  }, [mode, bookingContext, t]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr_320px] gap-4 h-[calc(100vh-6rem)]">
      <ChatThreadList
        mode={mode}
        threads={threads}
        selectedThreadId={selectedThreadId}
        setSelectedThreadId={handleSelectThread}
        latestByThread={latestByThread}
        unreadByThread={unreadByThread}
        labelForThread={labelForThread}
        notificationSupported={notificationSupported}
        notificationPermission={notificationPermission}
        requestBrowserNotifications={requestBrowserNotifications}
        artists={artists}
        selectedArtistId={selectedArtistId}
        setSelectedArtistId={setSelectedArtistId}
        customers={customers}
        selectedCustomerId={selectedCustomerId}
        setSelectedCustomerId={setSelectedCustomerId}
        handleStartStaffChat={handleStartStaffChat}
      />
      <ChatMessagePanel
        mode={mode}
        activeThread={activeThread}
        labelForThread={labelForThread}
        typingUsers={typingUsers}
        selectedThreadId={selectedThreadId}
        onArchive={archiveThread}
        messages={messages}
        mediaByMessageId={mediaByMessageId}
        userId={user?.id}
        otherLastReadAt={otherLastReadAt}
        messageText={messageText}
        onMessageChange={handleMessageChange}
        sending={sending}
        uploading={uploading}
        onSend={handleSend}
        onUpload={handleUpload}
        bookingContext={bookingContext}
        quickReplies={quickReplies}
        onQuickReply={handleQuickReply}
      />
      <ChatGalleryPanel
        gallery={gallery}
        signedUrls={signedUrls}
        pinsByMedia={pinsByMedia}
        togglePin={togglePin}
      />
    </div>
  );
};

export default UnifiedChatWorkspace;

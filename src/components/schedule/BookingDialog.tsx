import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, addMinutes } from "date-fns";
import { type Service } from "./ServicePresets";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import { pickServiceIdForBooking } from "@/lib/bookingService";
import BookingClientSearch, { type ClientPick } from "./BookingClientSearch";
import BookingLinkAccount from "./BookingLinkAccount";
import BookingConsentSection from "./BookingConsentSection";

/** Escape user text for PostgREST ilike patterns */
function escapeIlike(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function emptyToNull(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}

const EMAIL_FOR_MATCH = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Resolve portal customer id for an email: latest booking link, else profile public_contact_email (customer role). */
async function resolvePortalCustomerByEmail(emailRaw: string): Promise<{ user_id: string; display_name: string } | null> {
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_FOR_MATCH.test(email)) return null;
  const literal = escapeIlike(email);

  const { data: fromBooking } = await supabase
    .from("bookings")
    .select("client_user_id")
    .ilike("client_email", literal)
    .not("client_user_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const uidBooking = fromBooking?.client_user_id?.trim();
  if (uidBooking) {
    const { data: prof } = await supabase.from("profiles").select("display_name").eq("user_id", uidBooking).maybeSingle();
    return { user_id: uidBooking, display_name: (prof?.display_name || "").trim() || "Customer" };
  }

  const { data: profs } = await supabase
    .from("profiles")
    .select("user_id, display_name, public_contact_email")
    .ilike("public_contact_email", literal)
    .limit(20);
  if (!profs?.length) return null;

  const uids = profs.map((p) => p.user_id);
  const { data: roleRows } = await supabase.from("user_roles").select("user_id").eq("role", "customer").in("user_id", uids);
  const ok = new Set((roleRows ?? []).map((r) => r.user_id));
  const hit = profs.find((p) => ok.has(p.user_id));
  if (!hit) return null;
  return { user_id: hit.user_id, display_name: (hit.display_name || "").trim() || "Customer" };
}

function timeEqualIso(a: string, b: string): boolean {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 2000;
}

type BookingSavePayload = {
  artist_id: string;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  client_user_id: string | null;
  tattoo_style: string | null;
  tattoo_size: string | null;
  tattoo_placement: string | null;
  notes: string | null;
  booking_type: string;
  service_category: string;
  status: string;
  deposit_paid: boolean;
  starts_at: string;
  ends_at: string;
};

function diffBookingPayload(next: BookingSavePayload, baseline: BookingSavePayload): Partial<BookingSavePayload> {
  const patch: Partial<BookingSavePayload> = {};
  (Object.keys(next) as (keyof BookingSavePayload)[]).forEach((k) => {
    const nv = next[k];
    const bv = baseline[k];
    if (k === "starts_at" || k === "ends_at") {
      if (!timeEqualIso(nv as string, bv as string)) patch[k] = nv as never;
      return;
    }
    if (nv === bv) return;
    if ((nv === null || nv === undefined) && (bv === null || bv === undefined)) return;
    if (typeof nv === "string" && typeof bv === "string" && nv.trim() === bv.trim()) return;
    if (typeof nv === "boolean" && typeof bv === "boolean" && nv === bv) return;
    patch[k] = nv as never;
  });
  return patch;
}

type BookingNotificationPayload = {
  id: string;
  artist_id: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  booking_type: string;
  status: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
};

type BookingNotificationResult = {
  ok?: boolean;
  sent?: number;
  failed?: Array<{ email?: string; message?: string }>;
};

interface BookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  artists: { user_id: string; display_name: string | null; avatar_url?: string | null }[];
  prefillDate?: Date;
  prefillHour?: number;
  prefillMinute?: number;
  services: Service[];
  bookingToEdit?: {
    id: string;
    artist_id: string;
    client_name: string;
    client_phone: string | null;
    client_email: string | null;
    client_user_id?: string | null;
    tattoo_style: string | null;
    tattoo_size: string | null;
    tattoo_placement: string | null;
    notes: string | null;
    starts_at: string;
    ends_at: string;
    booking_type: string;
    service_category?: string | null;
    status: string;
    deposit_paid: boolean | null;
  } | null;
  onSaved?: () => void;
}

const BookingDialog = ({
  open,
  onOpenChange,
  userId,
  artists,
  prefillDate,
  prefillHour,
  prefillMinute,
  services,
  bookingToEdit,
  onSaved,
}: BookingDialogProps) => {
  const defaultDate = format(prefillDate || new Date(), "yyyy-MM-dd");
  const defaultStartTime = prefillHour !== undefined
    ? `${String(prefillHour).padStart(2, "0")}:${String(prefillMinute ?? 0).padStart(2, "0")}`
    : "10:00";

  const [serviceId, setServiceId] = useState<string>("");
  const [artistId, setArtistId] = useState<string>(userId);
  const [clientUserId, setClientUserId] = useState<string>("");
  const [linkAccountInput, setLinkAccountInput] = useState("");
  const [linkAccountSuggestions, setLinkAccountSuggestions] = useState<
    { user_id: string; display_name: string; public_contact_email: string | null }[]
  >([]);
  const [linkAccountOpen, setLinkAccountOpen] = useState(false);
  const [linkAccountLoading, setLinkAccountLoading] = useState(false);
  const linkAccountDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkAccountWrapRef = useRef<HTMLDivElement>(null);
  /** Skip one link-account debounced search after programmatic `setLinkAccountInput` (edit load, pick, auto-link). */
  const suppressLinkSearchRef = useRef(false);
  const [clientSuggestions, setClientSuggestions] = useState<ClientPick[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const suggestionsDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clientNameWrapRef = useRef<HTMLDivElement>(null);
  const notificationCooldownRef = useRef<Map<string, number>>(new Map());
  const editBaselineRef = useRef<BookingSavePayload | null>(null);
  const skipAutoLinkFromEmailRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [bookingConsentRows, setBookingConsentRows] = useState<
    Array<{ id: string; consent_pdf_url: string | null; created_at: string }>
  >([]);
  const [bookingConsentLoading, setBookingConsentLoading] = useState(false);
  const [consentDownloadBusy, setConsentDownloadBusy] = useState(false);

  const [form, setForm] = useState({
    client_name: "",
    client_phone: "",
    client_email: "",
    tattoo_style: "",
    tattoo_size: "",
    tattoo_placement: "",
    notes: "",
    date: defaultDate,
    start_time: defaultStartTime,
    status: "confirmed",
    deposit_paid: false,
  });

  useEffect(() => {
    if (!open) return;
    if (bookingToEdit) {
      setArtistId(bookingToEdit.artist_id || userId);
      setClientUserId((bookingToEdit.client_user_id || "").trim());
      const cuEdit = (bookingToEdit.client_user_id || "").trim();
      if (cuEdit) {
        setLinkAccountInput("");
        void (async () => {
          const { data: prof } = await supabase.from("profiles").select("display_name").eq("user_id", cuEdit).maybeSingle();
          if (prof?.display_name) {
            suppressLinkSearchRef.current = true;
            setLinkAccountInput(prof.display_name);
          }
        })();
      } else {
        setLinkAccountInput("");
      }
      const start = new Date(bookingToEdit.starts_at);
      setForm({
        client_name: bookingToEdit.client_name || "",
        client_phone: bookingToEdit.client_phone || "",
        client_email: bookingToEdit.client_email || "",
        tattoo_style: bookingToEdit.tattoo_style || "",
        tattoo_size: bookingToEdit.tattoo_size || "",
        tattoo_placement: bookingToEdit.tattoo_placement || "",
        notes: bookingToEdit.notes || "",
        date: format(start, "yyyy-MM-dd"),
        start_time: format(start, "HH:mm"),
        status: bookingToEdit.status || "confirmed",
        deposit_paid: !!bookingToEdit.deposit_paid,
      });
      const sid = pickServiceIdForBooking(services, {
        booking_type: bookingToEdit.booking_type,
        starts_at: bookingToEdit.starts_at,
        ends_at: bookingToEdit.ends_at,
        service_category: bookingToEdit.service_category,
      });
      setServiceId(sid || (services[0]?.id ?? ""));
    } else {
      setClientUserId("");
      setLinkAccountInput("");
      skipAutoLinkFromEmailRef.current = false;
      setArtistId(userId);
      setForm((f) => ({
        ...f,
        date: format(prefillDate || new Date(), "yyyy-MM-dd"),
        start_time: prefillHour !== undefined ? `${String(prefillHour).padStart(2, "0")}:00` : "10:00",
      }));
      if (services.length > 0) setServiceId(services[0].id);
      else setServiceId("");
    }
  }, [open, prefillDate, prefillHour, services, bookingToEdit, userId]);

  useEffect(() => {
    if (!open || !bookingToEdit) {
      editBaselineRef.current = null;
      return;
    }
    const cu = (bookingToEdit.client_user_id || "").trim();
    editBaselineRef.current = {
      artist_id: bookingToEdit.artist_id,
      client_name: (bookingToEdit.client_name || "").trim(),
      client_phone: emptyToNull(bookingToEdit.client_phone || ""),
      client_email: emptyToNull(bookingToEdit.client_email || ""),
      client_user_id: cu ? cu : null,
      tattoo_style: emptyToNull(bookingToEdit.tattoo_style || ""),
      tattoo_size: emptyToNull(bookingToEdit.tattoo_size || ""),
      tattoo_placement: emptyToNull(bookingToEdit.tattoo_placement || ""),
      notes: emptyToNull(bookingToEdit.notes || ""),
      booking_type: bookingToEdit.booking_type || "session",
      service_category: (bookingToEdit.service_category || "tattoo").toLowerCase(),
      status: bookingToEdit.status || "confirmed",
      deposit_paid: !!bookingToEdit.deposit_paid,
      starts_at: bookingToEdit.starts_at,
      ends_at: bookingToEdit.ends_at,
    };
  }, [open, bookingToEdit]);

  useEffect(() => {
    if (!open || !bookingToEdit?.id) {
      setBookingConsentRows([]);
      setBookingConsentLoading(false);
      return;
    }
    let cancelled = false;
    setBookingConsentLoading(true);
    void (async () => {
      const { data } = await supabase
        .from("consent_signatures")
        .select("id, consent_pdf_url, created_at")
        .eq("booking_id", bookingToEdit.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setBookingConsentRows((data as Array<{ id: string; consent_pdf_url: string | null; created_at: string }>) || []);
      setBookingConsentLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, bookingToEdit?.id]);

  const portalEmailLinkDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Reuse linked portal account for this email: any prior booking with client_user_id, else customer profile by public email. */
  const syncPortalLinkFromEmail = useCallback(async () => {
    if (!open || bookingToEdit) return;
    if (skipAutoLinkFromEmailRef.current) return;
    const email = form.client_email.trim().toLowerCase();
    if (!EMAIL_FOR_MATCH.test(email)) return;
    if (clientUserId.trim() !== "") return;
    const resolved = await resolvePortalCustomerByEmail(email);
    if (!resolved || skipAutoLinkFromEmailRef.current) return;
    setClientUserId(resolved.user_id);
    suppressLinkSearchRef.current = true;
    setLinkAccountInput(resolved.display_name);
  }, [open, bookingToEdit, form.client_email, clientUserId]);

  useEffect(() => {
    if (!open || bookingToEdit) return;
    if (portalEmailLinkDebounceRef.current) clearTimeout(portalEmailLinkDebounceRef.current);
    portalEmailLinkDebounceRef.current = setTimeout(() => {
      void syncPortalLinkFromEmail();
    }, 450);
    return () => {
      if (portalEmailLinkDebounceRef.current) clearTimeout(portalEmailLinkDebounceRef.current);
    };
  }, [open, bookingToEdit, form.client_email, clientUserId, syncPortalLinkFromEmail]);

  const fetchClientSuggestions = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < 2) {
      setClientSuggestions([]);
      return;
    }
    const pattern = `%${escapeIlike(q)}%`;
    setSuggestionsLoading(true);
    try {
      const [byName, byEmail, profs, importedContacts] = await Promise.all([
        supabase
          .from("bookings")
          .select("client_name, client_email, client_phone, client_user_id")
          .ilike("client_name", pattern)
          .order("starts_at", { ascending: false })
          .limit(45),
        supabase
          .from("bookings")
          .select("client_name, client_email, client_phone, client_user_id")
          .ilike("client_email", pattern)
          .order("starts_at", { ascending: false })
          .limit(45),
        supabase.from("profiles").select("user_id, display_name, phone").ilike("display_name", pattern).limit(20),
        // Optional contacts import table used for bulk-imported customer records.
        // Keep this resilient: if the table doesn't exist in an environment, we simply ignore it.
        supabase
          .from("contacts_import" as any)
          .select("name, email, phone")
          .or(`name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
          .limit(60),
      ]);

      const dedupeKey = (c: ClientPick) =>
        `${c.client_name.trim().toLowerCase()}|${(c.client_email || "").toLowerCase()}|${(c.client_phone || "").replace(/\s/g, "")}|${c.client_user_id || ""}`;

      const map = new Map<string, ClientPick>();
      const add = (c: ClientPick) => {
        if (!c.client_name.trim()) return;
        const k = dedupeKey(c);
        if (!map.has(k)) map.set(k, c);
      };

      for (const r of [...(byName.data ?? []), ...(byEmail.data ?? [])]) {
        add({
          client_name: r.client_name,
          client_email: r.client_email,
          client_phone: r.client_phone,
          client_user_id: r.client_user_id ?? null,
        });
      }
      for (const p of profs.data ?? []) {
        const name = (p.display_name || "").trim();
        if (!name) continue;
        add({
          client_name: name,
          client_email: null,
          client_phone: p.phone ?? null,
          client_user_id: p.user_id,
        });
      }
      for (const c of (importedContacts as any)?.data ?? []) {
        const name = String(c?.name || "").trim();
        if (!name) continue;
        add({
          client_name: name,
          client_email: c?.email ? String(c.email).trim().toLowerCase() : null,
          client_phone: c?.phone ? String(c.phone).trim() : null,
          client_user_id: null,
        });
      }

      setClientSuggestions([...map.values()].slice(0, 28));
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  const fetchLinkAccountSuggestions = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < 2) {
      setLinkAccountSuggestions([]);
      return;
    }
    const pattern = `%${escapeIlike(q)}%`;
    setLinkAccountLoading(true);
    try {
      const { data: profs, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, public_contact_email")
        .or(`display_name.ilike.${pattern},public_contact_email.ilike.${pattern}`)
        .limit(40);
      if (error || !profs?.length) {
        setLinkAccountSuggestions([]);
        return;
      }
      const uids = profs.map((p) => p.user_id);
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "customer")
        .in("user_id", uids);
      const ok = new Set((roleRows ?? []).map((r) => r.user_id));
      setLinkAccountSuggestions(profs.filter((p) => ok.has(p.user_id)).slice(0, 20));
    } catch {
      setLinkAccountSuggestions([]);
    } finally {
      setLinkAccountLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setClientSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }
    const q = form.client_name;
    if (suggestionsDebounce.current) clearTimeout(suggestionsDebounce.current);
    if (q.trim().length < 2) {
      setClientSuggestions([]);
      return;
    }
    suggestionsDebounce.current = setTimeout(() => {
      void fetchClientSuggestions(q);
    }, 280);
    return () => {
      if (suggestionsDebounce.current) clearTimeout(suggestionsDebounce.current);
    };
  }, [form.client_name, open, fetchClientSuggestions]);

  useEffect(() => {
    if (!suggestionsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (clientNameWrapRef.current && !clientNameWrapRef.current.contains(e.target as Node)) {
        setSuggestionsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [suggestionsOpen]);

  useEffect(() => {
    if (!open) {
      setLinkAccountSuggestions([]);
      setLinkAccountOpen(false);
      return;
    }
    if (suppressLinkSearchRef.current) {
      suppressLinkSearchRef.current = false;
      return;
    }
    const q = linkAccountInput;
    if (linkAccountDebounce.current) clearTimeout(linkAccountDebounce.current);
    if (q.trim().length < 2) {
      setLinkAccountSuggestions([]);
      setLinkAccountLoading(false);
      setLinkAccountOpen(false);
      return;
    }
    setLinkAccountLoading(true);
    linkAccountDebounce.current = setTimeout(() => {
      void fetchLinkAccountSuggestions(q);
    }, 280);
    return () => {
      if (linkAccountDebounce.current) clearTimeout(linkAccountDebounce.current);
    };
  }, [linkAccountInput, open, fetchLinkAccountSuggestions]);

  useEffect(() => {
    if (!linkAccountOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (linkAccountWrapRef.current && !linkAccountWrapRef.current.contains(e.target as Node)) {
        setLinkAccountOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [linkAccountOpen]);

  const applyClientPick = (c: ClientPick) => {
    setForm((f) => ({
      ...f,
      client_name: c.client_name,
      client_phone: c.client_phone || f.client_phone,
      client_email: c.client_email || f.client_email,
    }));
    setClientUserId(c.client_user_id || "");
    if (c.client_user_id?.trim()) {
      suppressLinkSearchRef.current = true;
      setLinkAccountInput(c.client_name.trim());
    }
    setSuggestionsOpen(false);
  };

  const selectedService = services.find((s) => s.id === serviceId) || services[0];
  const duration = selectedService?.duration || 60;
  const endTime = (() => {
    try {
      return format(addMinutes(new Date(`2000-01-01T${form.start_time}`), duration), "HH:mm");
    } catch { return "12:00"; }
  })();

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const sendBookingNotification = async (action: "created" | "updated" | "deleted", booking: BookingNotificationPayload) => {
    const dedupeKey = `${action}:${booking.id}`;
    const now = Date.now();
    const lastSentAt = notificationCooldownRef.current.get(dedupeKey) ?? 0;
    if (now - lastSentAt < 60_000) {
      console.warn("Booking notification skipped: dedupe cooldown", { dedupeKey });
      return;
    }

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    const token = session?.access_token ?? null;
    if (sessionError || !token) {
      toast.warning("Booking saved, but your session expired. Sign in again to send booking emails.");
      return;
    }

    const { data, error } = await supabase.functions.invoke<BookingNotificationResult>("booking-notifications", {
      body: {
        action,
        booking,
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (error) {
      const status = (error as any)?.context?.status ?? (error as any)?.status;
      if (status === 401) {
        toast.warning("Booking saved, but session expired (401). Please sign in again.");
        return;
      }
      // Booking CRUD should succeed even if notification delivery fails.
      console.error("Booking notification failed:", error);
      toast.warning("Booking saved, but email notification could not be sent.");
      return;
    }

    if (data?.failed && data.failed.length > 0) {
      const first = data.failed[0];
      const details = first?.email ? `${first.email}: ${first.message || "send failed"}` : first?.message || "send failed";
      toast.warning(`Booking saved, but some emails failed (${details}).`);
      return;
    }

    notificationCooldownRef.current.set(dedupeKey, now);
  };

  const handleSave = async () => {
    if (isSaving || isDeleting) return;
    setIsSaving(true);
    try {
      const startsAtLocal = new Date(`${form.date}T${form.start_time}:00`);
      const endsAtLocal = new Date(`${form.date}T${endTime}:00`);
      if (Number.isNaN(startsAtLocal.getTime()) || Number.isNaN(endsAtLocal.getTime())) {
        toast.error("Invalid date/time selected");
        return;
      }
      const starts_at = startsAtLocal.toISOString();
      const ends_at = endsAtLocal.toISOString();
      const nextPayload: BookingSavePayload = {
        artist_id: artistId || userId,
        client_name: form.client_name.trim(),
        client_phone: emptyToNull(form.client_phone),
        client_email: emptyToNull(form.client_email),
        client_user_id: clientUserId.trim() || null,
        tattoo_style: emptyToNull(form.tattoo_style),
        tattoo_size: emptyToNull(form.tattoo_size),
        tattoo_placement: emptyToNull(form.tattoo_placement),
        notes: emptyToNull(form.notes),
        booking_type: selectedService?.booking_type || "session",
        service_category: String(selectedService?.service_category || "tattoo").toLowerCase(),
        status: form.status || "confirmed",
        deposit_paid: !!form.deposit_paid,
        starts_at,
        ends_at,
      };

      if (bookingToEdit) {
        const baseline = editBaselineRef.current;
        const patch = baseline ? diffBookingPayload(nextPayload, baseline) : nextPayload;
        if (Object.keys(patch).length === 0) {
          toast.info("No changes to save");
          return;
        }
        const { data: updatedBooking, error } = await supabase
          .rpc("staff_update_booking", {
            p_id: bookingToEdit.id,
            p_patch: patch as unknown as Json,
          })
          .single();
        if (error || !updatedBooking) {
          toast.error(error?.message || "Could not save booking");
          return;
        }

        await sendBookingNotification("updated", {
          id: updatedBooking.id,
          artist_id: updatedBooking.artist_id,
          client_name: updatedBooking.client_name,
          client_email: updatedBooking.client_email,
          client_phone: updatedBooking.client_phone,
          booking_type: updatedBooking.booking_type,
          status: updatedBooking.status,
          starts_at: updatedBooking.starts_at,
          ends_at: updatedBooking.ends_at,
          notes: updatedBooking.notes,
        });
      } else {
        const { data: createdBooking, error } = await supabase
          .rpc("staff_insert_booking", {
            p_artist_id: nextPayload.artist_id,
            p_client_name: nextPayload.client_name,
            p_client_phone: nextPayload.client_phone,
            p_client_email: nextPayload.client_email,
            p_client_user_id: nextPayload.client_user_id,
            p_tattoo_style: nextPayload.tattoo_style,
            p_tattoo_size: nextPayload.tattoo_size,
            p_tattoo_placement: nextPayload.tattoo_placement,
            p_notes: nextPayload.notes,
            p_booking_type: nextPayload.booking_type,
            p_status: nextPayload.status,
            p_deposit_paid: nextPayload.deposit_paid,
            p_starts_at: nextPayload.starts_at,
            p_ends_at: nextPayload.ends_at,
            p_service_category: nextPayload.service_category,
          })
          .single();
        if (error || !createdBooking) {
          toast.error(error?.message || "Could not save booking");
          return;
        }

        await sendBookingNotification("created", {
          id: createdBooking.id,
          artist_id: createdBooking.artist_id,
          client_name: createdBooking.client_name,
          client_email: createdBooking.client_email,
          client_phone: createdBooking.client_phone,
          booking_type: createdBooking.booking_type,
          status: createdBooking.status,
          starts_at: createdBooking.starts_at,
          ends_at: createdBooking.ends_at,
          notes: createdBooking.notes,
        });
      }

      toast.success(bookingToEdit ? "Booking updated" : "Booking created");
      onOpenChange(false);
      onSaved?.();
      setForm({
        client_name: "", client_phone: "", client_email: "", tattoo_style: "",
        tattoo_size: "", tattoo_placement: "", notes: "",
        date: format(new Date(), "yyyy-MM-dd"), start_time: "10:00", status: "confirmed", deposit_paid: false,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isSaving || isDeleting) return;
    if (!bookingToEdit) return;
    const yes = window.confirm("Delete this booking?");
    if (!yes) return;
    setIsDeleting(true);
    try {
      const { data: bookingSnapshot, error } = await supabase.rpc("staff_delete_booking", { p_id: bookingToEdit.id }).single();
      if (error || !bookingSnapshot) {
        toast.error(error?.message || "Could not delete booking");
        return;
      }

      await sendBookingNotification("deleted", {
        id: bookingSnapshot.id,
        artist_id: bookingSnapshot.artist_id,
        client_name: bookingSnapshot.client_name,
        client_email: bookingSnapshot.client_email,
        client_phone: bookingSnapshot.client_phone,
        booking_type: bookingSnapshot.booking_type,
        status: bookingSnapshot.status,
        starts_at: bookingSnapshot.starts_at,
        ends_at: bookingSnapshot.ends_at,
        notes: bookingSnapshot.notes,
      });

      toast.success("Booking deleted");
      onOpenChange(false);
      onSaved?.();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">{bookingToEdit ? "Edit Booking" : "New Booking"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Artist *</Label>
            <Select value={artistId} onValueChange={setArtistId}>
              <SelectTrigger className="mt-1 bg-secondary border-border">
                <SelectValue placeholder="Select artist" />
              </SelectTrigger>
              <SelectContent>
                {(artists || []).map((a) => (
                  <SelectItem key={a.user_id} value={a.user_id}>
                    {(a.display_name || "").trim() || a.user_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Service *</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger className="mt-1 bg-secondary border-border">
                <SelectValue placeholder="Select service" />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.duration}min){s.price != null ? ` · £${s.price}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <BookingClientSearch
            clientName={form.client_name}
            onClientNameChange={(v) => update("client_name", v)}
            clientSuggestions={clientSuggestions}
            suggestionsOpen={suggestionsOpen}
            suggestionsLoading={suggestionsLoading}
            setSuggestionsOpen={setSuggestionsOpen}
            applyClientPick={applyClientPick}
            clientNameWrapRef={clientNameWrapRef}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Phone</Label>
              <Input value={form.client_phone} onChange={(e) => update("client_phone", e.target.value)} className="mt-1 bg-secondary border-border" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Email</Label>
              <Input
                value={form.client_email}
                onChange={(e) => {
                  skipAutoLinkFromEmailRef.current = false;
                  update("client_email", e.target.value);
                }}
                className="mt-1 bg-secondary border-border"
              />
            </div>
          </div>
          <BookingLinkAccount
            linkAccountInput={linkAccountInput}
            setLinkAccountInput={setLinkAccountInput}
            linkAccountOpen={linkAccountOpen}
            linkAccountSuggestions={linkAccountSuggestions}
            linkAccountLoading={linkAccountLoading}
            linkAccountWrapRef={linkAccountWrapRef}
            setClientUserId={setClientUserId}
            setLinkAccountOpen={setLinkAccountOpen}
            setLinkAccountSuggestions={setLinkAccountSuggestions}
            suppressLinkSearchRef={suppressLinkSearchRef}
            skipAutoLinkFromEmailRef={skipAutoLinkFromEmailRef}
            syncPortalLinkFromEmail={syncPortalLinkFromEmail}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Style</Label>
              <Input value={form.tattoo_style} onChange={(e) => update("tattoo_style", e.target.value)} className="mt-1 bg-secondary border-border" placeholder="e.g. Realism" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Size</Label>
              <Select value={form.tattoo_size} onValueChange={(v) => update("tattoo_size", v)}>
                <SelectTrigger className="mt-1 bg-secondary border-border"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small (2-4")</SelectItem>
                  <SelectItem value="medium">Medium (4-6")</SelectItem>
                  <SelectItem value="large">Large (6-10")</SelectItem>
                  <SelectItem value="xlarge">X-Large (10"+)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Placement</Label>
            <Input value={form.tattoo_placement} onChange={(e) => update("tattoo_placement", e.target.value)} className="mt-1 bg-secondary border-border" placeholder="e.g. Forearm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Date</Label>
              <Input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} className="mt-1 bg-secondary border-border" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Start Time</Label>
              <Input type="time" value={form.start_time} onChange={(e) => update("start_time", e.target.value)} className="mt-1 bg-secondary border-border" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Status</Label>
              <Select value={form.status} onValueChange={(v) => update("status", v)}>
                <SelectTrigger className="mt-1 bg-secondary border-border"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="no-show">No show</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Deposit</Label>
              <Select value={form.deposit_paid ? "paid" : "pending"} onValueChange={(v) => setForm((f) => ({ ...f, deposit_paid: v === "paid" }))}>
                <SelectTrigger className="mt-1 bg-secondary border-border"><SelectValue placeholder="Deposit" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Duration: {duration}min → ends at {endTime}
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Notes</Label>
            <Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} className="mt-1 bg-secondary border-border" rows={2} />
          </div>
          {bookingToEdit ? (
            <BookingConsentSection
              bookingConsentLoading={bookingConsentLoading}
              bookingConsentRows={bookingConsentRows}
              clientName={bookingToEdit.client_name}
              consentDownloadBusy={consentDownloadBusy}
              setConsentDownloadBusy={setConsentDownloadBusy}
            />
          ) : null}
          {bookingToEdit ? (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="w-full" onClick={handleDelete} disabled={isSaving || isDeleting}>
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
              <Button variant="gold" className="w-full" onClick={handleSave} disabled={isSaving || isDeleting || !artistId || !form.client_name || !serviceId}>
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          ) : (
            <Button variant="gold" className="w-full" onClick={handleSave} disabled={isSaving || isDeleting || !artistId || !form.client_name || !serviceId}>
              {isSaving ? "Creating..." : "Create Booking"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BookingDialog;

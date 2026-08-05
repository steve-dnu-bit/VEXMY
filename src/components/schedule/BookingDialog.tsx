import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TimeInput } from "@/components/ui/time-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, addMinutes, differenceInMinutes } from "date-fns";
import { type Service } from "./ServicePresets";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import { pickServiceIdForBooking } from "@/lib/bookingService";
import BookingClientSearch, { type ClientPick } from "./BookingClientSearch";
import BookingLinkAccount from "./BookingLinkAccount";
import BookingConsentSection from "./BookingConsentSection";
import { useScheduleI18n } from "@/hooks/useScheduleI18n";
import { loadOrganizationCustomerIds, loadOrganizationMemberIds } from "@/lib/organizationMembers";
import { maxDepositAmountForCurrency } from "@/lib/depositLimits";
import { currencyForShopCountry, formatShopMoney } from "@/lib/shopCurrency";
import { loadShopSettings } from "@/lib/shopSettings";
import {
  clampDepositAmount,
  DEFAULT_DEPOSIT_AMOUNT,
  loadShopDefaultDepositAmount,
  parseDepositInput,
} from "@/lib/shopDepositSettings";
import { searchOrganizationClients } from "@/lib/clientSearch";
import { resolveDepositForService } from "@/lib/serviceDeposit";
import { BLOCKER_DURATION_OPTIONS, type BlockerKindValue, isBlockerBooking } from "@/lib/bookingTypes";

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
async function resolvePortalCustomerByEmail(
  emailRaw: string,
  customerLabel = "Customer",
): Promise<{ user_id: string; display_name: string } | null> {
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
    return { user_id: uidBooking, display_name: (prof?.display_name || "").trim() || customerLabel };
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
  return { user_id: hit.user_id, display_name: (hit.display_name || "").trim() || customerLabel };
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
  deposit_amount: number;
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
    if (k === "deposit_amount") {
      if (Math.abs((nv as number) - (bv as number)) > 0.001) patch[k] = nv as never;
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

interface BookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  artists: { user_id: string; display_name: string | null; avatar_url?: string | null }[];
  prefillDate?: Date;
  prefillHour?: number;
  prefillMinute?: number;
  prefillArtistId?: string;
  prefillServiceId?: string;
  dialogMode?: "booking" | "blocker";
  prefillBlockerKind?: BlockerKindValue;
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
    deposit_amount?: number | null;
  } | null;
  onSaved?: (movedTo?: Date) => void;
}

const BookingDialog = ({
  open,
  onOpenChange,
  userId,
  artists,
  prefillDate,
  prefillHour,
  prefillMinute,
  prefillArtistId,
  prefillServiceId,
  dialogMode = "booking",
  prefillBlockerKind,
  services,
  bookingToEdit,
  onSaved,
}: BookingDialogProps) => {
  const { t, blockerKindLabel } = useScheduleI18n();
  const isBlocker = dialogMode === "blocker" || isBlockerBooking(bookingToEdit || { booking_type: "" });
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
  const editBaselineRef = useRef<BookingSavePayload | null>(null);
  const editingBookingIdRef = useRef<string | null>(null);
  const formInitKeyRef = useRef<string | null>(null);
  const baselineInitKeyRef = useRef<string | null>(null);
  const skipAutoLinkFromEmailRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [bookingConsentRows, setBookingConsentRows] = useState<
    Array<{ id: string; consent_pdf_url: string | null; created_at: string }>
  >([]);
  const [bookingConsentLoading, setBookingConsentLoading] = useState(false);
  const [consentDownloadBusy, setConsentDownloadBusy] = useState(false);
  const [shopCurrency, setShopCurrency] = useState("gbp");
  const [shopDefaultDeposit, setShopDefaultDeposit] = useState(DEFAULT_DEPOSIT_AMOUNT);
  const [blockerKind, setBlockerKind] = useState<BlockerKindValue>("private");
  const [blockerDurationMinutes, setBlockerDurationMinutes] = useState(480);

  const maxDeposit = maxDepositAmountForCurrency(shopCurrency);

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
    deposit_amount: DEFAULT_DEPOSIT_AMOUNT,
  });

  useEffect(() => {
    if (!open) {
      formInitKeyRef.current = null;
      editingBookingIdRef.current = null;
      return;
    }

    if (bookingToEdit?.id) {
      editingBookingIdRef.current = bookingToEdit.id;
    }

    const initKey = bookingToEdit?.id
      ? `edit:${bookingToEdit.id}`
      : isBlocker
        ? `blocker:${format(prefillDate || new Date(), "yyyy-MM-dd")}:${prefillHour ?? ""}:${prefillMinute ?? ""}:${prefillArtistId ?? ""}:${prefillBlockerKind ?? ""}`
        : `new:${format(prefillDate || new Date(), "yyyy-MM-dd")}:${prefillHour ?? ""}:${prefillMinute ?? ""}:${prefillArtistId ?? ""}:${prefillServiceId ?? ""}`;

    if (formInitKeyRef.current === initKey) return;
    formInitKeyRef.current = initKey;

    let cancelled = false;
    void (async () => {
      const shop = await loadShopSettings();
      const currency = currencyForShopCountry(shop?.country);
      const defaultAmount = await loadShopDefaultDepositAmount();
      if (cancelled) return;
      setShopCurrency(currency);
      setShopDefaultDeposit(defaultAmount);

      if (bookingToEdit) {
        setArtistId(bookingToEdit.artist_id || userId);
        if (isBlockerBooking(bookingToEdit)) {
          const cat = (bookingToEdit.service_category || "private").toLowerCase();
          const kind: BlockerKindValue = cat === "holiday" ? "holiday" : "private";
          setBlockerKind(kind);
          const dur = differenceInMinutes(new Date(bookingToEdit.ends_at), new Date(bookingToEdit.starts_at));
          const snapped =
            dur > 0
              ? BLOCKER_DURATION_OPTIONS.reduce((best, opt) =>
                  Math.abs(opt - dur) < Math.abs(best - dur) ? opt : best,
                )
              : kind === "holiday"
                ? 480
                : 60;
          setBlockerDurationMinutes(snapped);
          setClientUserId("");
          setLinkAccountInput("");
        } else {
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
          deposit_amount: clampDepositAmount(
            Number(bookingToEdit.deposit_amount ?? DEFAULT_DEPOSIT_AMOUNT),
            currency,
          ),
        });
        if (!isBlockerBooking(bookingToEdit)) {
          const sid = pickServiceIdForBooking(services, {
            booking_type: bookingToEdit.booking_type,
            starts_at: bookingToEdit.starts_at,
            ends_at: bookingToEdit.ends_at,
            service_category: bookingToEdit.service_category,
          });
          setServiceId(sid || (services[0]?.id ?? ""));
        }
      } else if (isBlocker) {
        setClientUserId("");
        setLinkAccountInput("");
        skipAutoLinkFromEmailRef.current = false;
        const kind = prefillBlockerKind || "private";
        setBlockerKind(kind);
        setBlockerDurationMinutes(kind === "holiday" ? 480 : 60);
        const prefillArtist =
          prefillArtistId && artists.some((a) => a.user_id === prefillArtistId) ? prefillArtistId : userId;
        setArtistId(prefillArtist);
        const startTime =
          prefillHour !== undefined
            ? `${String(prefillHour).padStart(2, "0")}:${String(prefillMinute ?? 0).padStart(2, "0")}`
            : "10:00";
        setForm((f) => ({
          ...f,
          client_name: blockerKindLabel(kind),
          client_phone: "",
          client_email: "",
          tattoo_style: "",
          tattoo_size: "",
          tattoo_placement: "",
          notes: "",
          date: format(prefillDate || new Date(), "yyyy-MM-dd"),
          start_time: startTime,
          status: "confirmed",
          deposit_paid: false,
          deposit_amount: 0,
        }));
      } else {
        setClientUserId("");
        setLinkAccountInput("");
        skipAutoLinkFromEmailRef.current = false;
        const prefillArtist =
          prefillArtistId && artists.some((a) => a.user_id === prefillArtistId) ? prefillArtistId : userId;
        setArtistId(prefillArtist);
        const startTime =
          prefillHour !== undefined
            ? `${String(prefillHour).padStart(2, "0")}:${String(prefillMinute ?? 0).padStart(2, "0")}`
            : "10:00";
        setForm((f) => ({
          ...f,
          date: format(prefillDate || new Date(), "yyyy-MM-dd"),
          start_time: startTime,
          deposit_amount: defaultAmount,
        }));
        if (services.length > 0) {
          const sid =
            prefillServiceId && services.some((s) => s.id === prefillServiceId)
              ? prefillServiceId
              : services[0].id;
          setServiceId(sid);
        } else setServiceId("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, bookingToEdit, prefillDate, prefillHour, prefillMinute, prefillArtistId, prefillServiceId, prefillBlockerKind, isBlocker, artists, services, userId, blockerKindLabel]);

  useEffect(() => {
    if (!open || !bookingToEdit) {
      editBaselineRef.current = null;
      baselineInitKeyRef.current = null;
      return;
    }
    const baselineKey = `edit:${bookingToEdit.id}:${shopCurrency}`;
    if (baselineInitKeyRef.current === baselineKey) return;
    baselineInitKeyRef.current = baselineKey;
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
      deposit_amount: clampDepositAmount(
        Number(bookingToEdit.deposit_amount ?? DEFAULT_DEPOSIT_AMOUNT),
        shopCurrency,
      ),
      starts_at: bookingToEdit.starts_at,
      ends_at: bookingToEdit.ends_at,
    };
  }, [open, bookingToEdit, shopCurrency]);

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
    const resolved = await resolvePortalCustomerByEmail(email, t("schedule.customer"));
    if (!resolved || skipAutoLinkFromEmailRef.current) return;
    setClientUserId(resolved.user_id);
    suppressLinkSearchRef.current = true;
    setLinkAccountInput(resolved.display_name);
  }, [open, bookingToEdit, form.client_email, clientUserId, t]);

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
    setSuggestionsLoading(true);
    try {
      setClientSuggestions(await searchOrganizationClients(q));
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
      const [orgMemberIds, orgCustomerIds] = await Promise.all([
        loadOrganizationMemberIds(),
        loadOrganizationCustomerIds(),
      ]);
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "customer")
        .in("user_id", uids);
      const ok = new Set((roleRows ?? []).map((r) => r.user_id));
      setLinkAccountSuggestions(
        profs
          .filter((p) => ok.has(p.user_id))
          .filter((p) => orgCustomerIds.has(p.user_id) || orgMemberIds.has(p.user_id))
          .slice(0, 20),
      );
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
  const duration = isBlocker ? blockerDurationMinutes : selectedService?.duration || 60;
  const endTime = (() => {
    try {
      return format(addMinutes(new Date(`2000-01-01T${form.start_time}`), duration), "HH:mm");
    } catch { return "12:00"; }
  })();

  const blockerDurationLabel = (minutes: number) => {
    if (minutes === 1440) return t("schedule.blockerDurations.fullDay");
    if (minutes % 60 === 0 && minutes >= 60) {
      const hours = minutes / 60;
      return t("schedule.blockerDurations.hours", { count: hours, defaultValue: `${hours} hours` });
    }
    return t("schedule.blockerDurations.minutes", { count: minutes, defaultValue: `${minutes} min` });
  };

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (isSaving || isDeleting) return;
    setIsSaving(true);
    try {
      const startsAtLocal = new Date(`${form.date}T${form.start_time}:00`);
      const endsAtLocal = new Date(`${form.date}T${endTime}:00`);
      if (Number.isNaN(startsAtLocal.getTime()) || Number.isNaN(endsAtLocal.getTime())) {
        toast.error(t("schedule.invalidDateTime"));
        return;
      }
      const starts_at = startsAtLocal.toISOString();
      const ends_at = isBlocker
        ? addMinutes(startsAtLocal, blockerDurationMinutes).toISOString()
        : endsAtLocal.toISOString();
      const editingId = bookingToEdit?.id ?? editingBookingIdRef.current;

      if (isBlocker) {
        if (!form.client_name.trim()) {
          toast.error(t("schedule.blockerTitleRequired"));
          return;
        }
        const nextPayload: BookingSavePayload = {
          artist_id: artistId || userId,
          client_name: form.client_name.trim(),
          client_phone: null,
          client_email: null,
          client_user_id: null,
          tattoo_style: null,
          tattoo_size: null,
          tattoo_placement: null,
          notes: emptyToNull(form.notes),
          booking_type: "blocker",
          service_category: blockerKind,
          status: form.status || "confirmed",
          deposit_paid: false,
          deposit_amount: 0,
          starts_at,
          ends_at,
        };

        if (editingId) {
          const baseline = editBaselineRef.current;
          const patch = baseline ? diffBookingPayload(nextPayload, baseline) : nextPayload;
          if (Object.keys(patch).length === 0) {
            toast.info(t("schedule.noChanges"));
            return;
          }
          const { data: updatedBooking, error } = await supabase
            .rpc("staff_update_booking", {
              p_id: editingId,
              p_patch: patch as unknown as Json,
            })
            .single();
          if (error || !updatedBooking) {
            toast.error(error?.message || t("schedule.couldNotSave"));
            return;
          }
          toast.success(t("schedule.blockerUpdated"));
          onOpenChange(false);
          onSaved?.(startsAtLocal);
          return;
        }

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
            p_deposit_amount: nextPayload.deposit_amount,
          })
          .single();
        if (error || !createdBooking) {
          toast.error(error?.message || t("schedule.couldNotSave"));
          return;
        }
        toast.success(t("schedule.blockerCreated"));
        onOpenChange(false);
        onSaved?.(startsAtLocal);
        return;
      }

      const depositAmount = editingId
        ? (() => {
            const parsed = parseDepositInput(String(form.deposit_amount), shopCurrency);
            if (parsed == null) {
              toast.error(t("schedule.depositAmountInvalid", { max: formatShopMoney(maxDeposit, shopCurrency) }));
              return null;
            }
            return parsed;
          })()
        : resolveDepositForService(selectedService, shopDefaultDeposit, shopCurrency);
      if (depositAmount == null) return;

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
        deposit_amount: depositAmount,
        starts_at,
        ends_at,
      };

      if (editingId) {
        const baseline = editBaselineRef.current;
        const patch = baseline ? diffBookingPayload(nextPayload, baseline) : nextPayload;
        if (Object.keys(patch).length === 0) {
          toast.info(t("schedule.noChanges"));
          return;
        }
        const { data: updatedBooking, error } = await supabase
          .rpc("staff_update_booking", {
            p_id: editingId,
            p_patch: patch as unknown as Json,
          })
          .single();
        if (error || !updatedBooking) {
          toast.error(error?.message || t("schedule.couldNotSave"));
          return;
        }

        toast.success(t("schedule.bookingUpdated"));
        onOpenChange(false);
        onSaved?.(startsAtLocal);
        return;
      }

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
          p_deposit_amount: nextPayload.deposit_amount,
        })
        .single();
      if (error || !createdBooking) {
        toast.error(error?.message || t("schedule.couldNotSave"));
        return;
      }

      toast.success(t("schedule.bookingCreated"));
      onOpenChange(false);
      onSaved?.(startsAtLocal);

      setForm({
        client_name: "", client_phone: "", client_email: "", tattoo_style: "",
        tattoo_size: "", tattoo_placement: "", notes: "",
        date: format(new Date(), "yyyy-MM-dd"), start_time: "10:00", status: "confirmed", deposit_paid: false,
        deposit_amount: DEFAULT_DEPOSIT_AMOUNT,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isSaving || isDeleting) return;
    const editingId = bookingToEdit?.id ?? editingBookingIdRef.current;
    if (!editingId) return;
    const yes = window.confirm(isBlocker ? t("schedule.deleteBlockerConfirm") : t("schedule.deleteConfirm"));
    if (!yes) return;
    setIsDeleting(true);
    try {
      const { data: bookingSnapshot, error } = await supabase.rpc("staff_delete_booking", { p_id: editingId }).single();
      if (error || !bookingSnapshot) {
        toast.error(error?.message || t("schedule.couldNotDelete"));
        return;
      }

      toast.success(t("schedule.bookingDeleted"));
      onOpenChange(false);
      onSaved?.();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto overscroll-contain pb-native-nav themed-scrollbar sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            {bookingToEdit || editingBookingIdRef.current
              ? isBlocker
                ? t("schedule.editBlocker")
                : t("schedule.editBooking")
              : isBlocker
                ? t("schedule.newBlocker")
                : t("schedule.newBooking")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("schedule.artistRequired")}</Label>
            <Select value={artistId} onValueChange={setArtistId}>
              <SelectTrigger className="mt-1 field-surface border-border">
                <SelectValue placeholder={t("schedule.selectArtist")} />
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
          {isBlocker ? (
            <>
              <div>
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("schedule.blockerKind")}</Label>
                <Select
                  value={blockerKind}
                  onValueChange={(v) => {
                    const kind = v as BlockerKindValue;
                    setBlockerKind(kind);
                    if (!bookingToEdit && (form.client_name.trim() === "" || form.client_name === blockerKindLabel(blockerKind))) {
                      setForm((f) => ({ ...f, client_name: blockerKindLabel(kind) }));
                    }
                    if (!bookingToEdit && kind === "holiday" && blockerDurationMinutes < 240) {
                      setBlockerDurationMinutes(480);
                    }
                  }}
                >
                  <SelectTrigger className="mt-1 field-surface border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="holiday">{t("schedule.blockerKinds.holiday")}</SelectItem>
                    <SelectItem value="private">{t("schedule.blockerKinds.private")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("schedule.blockerTitleRequired")}</Label>
                <Input
                  value={form.client_name}
                  onChange={(e) => update("client_name", e.target.value)}
                  className="mt-1 field-surface border-border"
                  placeholder={t("schedule.blockerTitlePlaceholder")}
                />
              </div>
            </>
          ) : (
            <>
          <div>
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("schedule.serviceRequired")}</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger className="mt-1 field-surface border-border">
                <SelectValue placeholder={t("schedule.select")} />
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
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("schedule.phone")}</Label>
              <Input value={form.client_phone} onChange={(e) => update("client_phone", e.target.value)} className="mt-1 field-surface border-border" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Email</Label>
              <Input
                value={form.client_email}
                onChange={(e) => {
                  skipAutoLinkFromEmailRef.current = false;
                  update("client_email", e.target.value);
                }}
                className="mt-1 field-surface border-border"
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
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("schedule.style")}</Label>
              <Input value={form.tattoo_style} onChange={(e) => update("tattoo_style", e.target.value)} className="mt-1 field-surface border-border" placeholder={t("schedule.stylePlaceholder")} />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("schedule.size")}</Label>
              <Select value={form.tattoo_size} onValueChange={(v) => update("tattoo_size", v)}>
                <SelectTrigger className="mt-1 field-surface border-border"><SelectValue placeholder={t("schedule.select")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">{t("schedule.tattooSizes.small")}</SelectItem>
                  <SelectItem value="medium">{t("schedule.tattooSizes.medium")}</SelectItem>
                  <SelectItem value="large">{t("schedule.tattooSizes.large")}</SelectItem>
                  <SelectItem value="xlarge">{t("schedule.tattooSizes.xlarge")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("schedule.placement")}</Label>
            <Input value={form.tattoo_placement} onChange={(e) => update("tattoo_placement", e.target.value)} className="mt-1 field-surface border-border" placeholder={t("schedule.placementPlaceholder")} />
          </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("schedule.date")}</Label>
              <Input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} className="mt-1 field-surface border-border" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("schedule.startTime")}</Label>
              <TimeInput step={900} value={form.start_time} onChange={(v) => update("start_time", v)} className="mt-1" />
            </div>
          </div>
          {isBlocker ? (
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("schedule.blockerDuration")}</Label>
              <Select value={String(blockerDurationMinutes)} onValueChange={(v) => setBlockerDurationMinutes(Number(v))}>
                <SelectTrigger className="mt-1 field-surface border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLOCKER_DURATION_OPTIONS.map((minutes) => (
                    <SelectItem key={minutes} value={String(minutes)}>
                      {blockerDurationLabel(minutes)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {isBlocker ? (
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("schedule.status")}</Label>
              <Select value={form.status} onValueChange={(v) => update("status", v)}>
                <SelectTrigger className="mt-1 field-surface border-border"><SelectValue placeholder={t("schedule.status")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed">{t("schedule.statusOptions.confirmed")}</SelectItem>
                  <SelectItem value="completed">{t("schedule.statusOptions.completed")}</SelectItem>
                  <SelectItem value="cancelled">{t("schedule.statusOptions.cancelled")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("schedule.status")}</Label>
                <Select value={form.status} onValueChange={(v) => update("status", v)}>
                  <SelectTrigger className="mt-1 field-surface border-border"><SelectValue placeholder={t("schedule.status")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirmed">{t("schedule.statusOptions.confirmed")}</SelectItem>
                    <SelectItem value="completed">{t("schedule.statusOptions.completed")}</SelectItem>
                    <SelectItem value="cancelled">{t("schedule.statusOptions.cancelled")}</SelectItem>
                    <SelectItem value="no-show">{t("schedule.statusOptions.no-show")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {bookingToEdit && (bookingToEdit.deposit_amount ?? shopDefaultDeposit) > 0 ? (
                <div>
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("schedule.depositStatus")}</Label>
                  <Select value={form.deposit_paid ? "paid" : "pending"} onValueChange={(v) => setForm((f) => ({ ...f, deposit_paid: v === "paid" }))}>
                    <SelectTrigger className="mt-1 field-surface border-border"><SelectValue placeholder={t("schedule.depositStatus")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">{t("schedule.depositOptions.pending")}</SelectItem>
                      <SelectItem value="paid">{t("schedule.depositOptions.paid")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          )}
          {!isBlocker && !bookingToEdit && selectedService ? (
            <p className="text-xs text-muted-foreground rounded-md border border-border/60 bg-secondary/20 px-3 py-2">
              {selectedService.deposit_required
                ? t("schedule.depositFromService", {
                    amount: formatShopMoney(
                      resolveDepositForService(selectedService, shopDefaultDeposit, shopCurrency),
                      shopCurrency,
                    ),
                  })
                : t("schedule.noDepositForService")}
            </p>
          ) : null}
          {!isBlocker && bookingToEdit && (bookingToEdit.deposit_amount ?? shopDefaultDeposit) <= 0 ? (
            <p className="text-xs text-muted-foreground rounded-md border border-border/60 bg-secondary/20 px-3 py-2">
              {t("schedule.noDepositForService")}
            </p>
          ) : null}
          {!isBlocker && bookingToEdit && (bookingToEdit.deposit_amount ?? shopDefaultDeposit) > 0 ? (
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("schedule.depositAmount")}</Label>
              <Input
                type="number"
                min={0.3}
                max={maxDeposit}
                step={0.01}
                value={form.deposit_amount}
                onChange={(e) => {
                  const parsed = parseDepositInput(e.target.value, shopCurrency);
                  setForm((f) => ({
                    ...f,
                    deposit_amount: parsed ?? (Number(e.target.value) || 0),
                  }));
                }}
                className="mt-1 field-surface border-border"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t("schedule.depositAmountHint", { max: formatShopMoney(maxDeposit, shopCurrency) })}
              </p>
            </div>
          ) : null}
          <div className="text-xs text-muted-foreground">
            {t("schedule.durationEnds", { duration, endTime })}
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("schedule.notes")}</Label>
            <Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} className="mt-1 field-surface border-border" rows={2} />
          </div>
          {bookingToEdit && !isBlocker ? (
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
                {isDeleting ? t("schedule.deleting") : t("schedule.delete")}
              </Button>
              <Button variant="gold" className="w-full" onClick={handleSave} disabled={isSaving || isDeleting || !artistId || !form.client_name || (!isBlocker && !serviceId)}>
                {isSaving ? t("schedule.saving") : t("schedule.saveChanges")}
              </Button>
            </div>
          ) : (
            <Button variant="gold" className="w-full" onClick={handleSave} disabled={isSaving || isDeleting || !artistId || !form.client_name || (!isBlocker && !serviceId)}>
              {isSaving ? t("schedule.creating") : isBlocker ? t("schedule.createBlocker") : t("schedule.createBooking")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BookingDialog;

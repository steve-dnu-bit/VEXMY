import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { startOfWeek, addDays } from "date-fns";
import AppLayout from "@/components/AppLayout";
import ScheduleHeader from "@/components/schedule/ScheduleHeader";
import ScheduleSidebar from "@/components/schedule/ScheduleSidebar";
import TimeGrid from "@/components/schedule/TimeGrid";
import BookingDialog from "@/components/schedule/BookingDialog";
import BookingDetailPanel from "@/components/schedule/BookingDetailPanel";
import { useServices } from "@/components/schedule/ServicePresets";
import { toast } from "sonner";
import { readScheduleArtistColors, writeScheduleArtistColors } from "@/lib/artistThemeCache";
import { useScheduleI18n } from "@/hooks/useScheduleI18n";

const SCHEDULE_SIDEBAR_STORAGE_KEY = "schedule.sidebar.open";
const SCHEDULE_VIEW_STORAGE_KEY = "schedule.view";
const SCHEDULE_ARTISTS_STORAGE_KEY = "schedule.selectedArtists";

interface Booking {
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
  booking_type: string;
  service_category?: string | null;
  status: string;
  starts_at: string;
  ends_at: string;
  deposit_paid: boolean | null;
}

interface Profile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  portal_bg_color: string | null;
}

/** Alphanumeric slug of display name — "Mr. Tattooist" → "mrtattooist". */
function scheduleArtistNameSlug(displayName: string | null) {
  return (displayName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseHiddenScheduleArtistIds(): Set<string> {
  const raw = import.meta.env.VITE_SCHEDULE_HIDDEN_ARTIST_IDS;
  if (!raw || typeof raw !== "string") return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** Always omit from artist dropdown / book-as-artist list when configured via env. */
function isHardHiddenScheduleArtist(p: Profile): boolean {
  return parseHiddenScheduleArtistIds().has(p.user_id);
}

const SchedulePage = () => {
  const { t } = useScheduleI18n();
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profilesReady, setProfilesReady] = useState(false);
  const [artistColorCache] = useState(readScheduleArtistColors);
  const [selectedArtists, setSelectedArtists] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(SCHEDULE_ARTISTS_STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((v): v is string => typeof v === "string");
    } catch {
      return [];
    }
  });
  const { services } = useServices();
  const [view, setView] = useState<"day" | "week">(() => {
    if (typeof window === "undefined") return "day";
    const saved = window.localStorage.getItem(SCHEDULE_VIEW_STORAGE_KEY);
    return saved === "week" ? "week" : "day";
  });
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [prefillDate, setPrefillDate] = useState<Date | undefined>();
  const [prefillHour, setPrefillHour] = useState<number | undefined>();
  const [prefillMinute, setPrefillMinute] = useState<number | undefined>();
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem(SCHEDULE_SIDEBAR_STORAGE_KEY);
    if (saved === "true") return true;
    if (saved === "false") return false;
    return window.innerWidth >= 768;
  });
  const [teamSearch, setTeamSearch] = useState("");
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = view === "day" ? [currentDate] : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SCHEDULE_SIDEBAR_STORAGE_KEY, String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SCHEDULE_VIEW_STORAGE_KEY, view);
  }, [view]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SCHEDULE_ARTISTS_STORAGE_KEY, JSON.stringify(selectedArtists));
  }, [selectedArtists]);

  useEffect(() => {
    setProfilesReady(false);
    fetchBookings();
    fetchProfiles();

    const channel = supabase
      .channel("bookings-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => fetchBookings())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentDate, view]);

  // `selectedArtists` is intentionally empty (`[]`) to mean "All artists".
  // Specific artist selection is represented as `[artistId]`.

  const fetchBookings = async () => {
    const resetDate = new Date(currentDate);
    resetDate.setHours(0, 0, 0, 0);
    const from = view === "day" ? resetDate.toISOString() : weekStart.toISOString();
    const to =
      view === "day"
        ? new Date(new Date(currentDate).setHours(23, 59, 59, 999)).toISOString()
        : addDays(weekStart, 7).toISOString();

    const { data, error } = await supabase.from("bookings").select("*").gte("starts_at", from).lt("starts_at", to).order("starts_at");
    if (error) {
      toast.error(error.message || t("schedule.couldNotLoadBookings", { defaultValue: "Could not load bookings" }));
      return;
    }
    setBookings((data || []) as Booking[]);
  };

  const fetchProfiles = async () => {
    const [{ data: allProfiles, error: profilesErr }, { data: allRoles, error: roleErr }] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name, avatar_url, portal_bg_color"),
      supabase.from("user_roles").select("user_id, role"),
    ]);

    if (profilesErr) {
      toast.error(profilesErr.message || t("schedule.couldNotLoadTeamProfiles", { defaultValue: "Could not load team profiles" }));
      setProfilesReady(true);
      return;
    }

    // Can't tell customer vs staff — show every profile so the schedule stays usable.
    if (roleErr) {
      const list = (allProfiles || []) as Profile[];
      setProfiles(list);
      writeScheduleArtistColors(list);
      setProfilesReady(true);
      return;
    }

    const rolesByUser = new Map<string, string[]>();
    for (const row of allRoles || []) {
      const list = rolesByUser.get(row.user_id) || [];
      list.push(row.role);
      rolesByUser.set(row.user_id, list);
    }

    const { data: bookingArtistRows } = await supabase.from("bookings").select("artist_id");
    const bookingArtistIds = new Set<string>();
    for (const row of bookingArtistRows || []) {
      if (row?.artist_id) bookingArtistIds.add(row.artist_id);
    }

    const isPureCustomerOnly = (uid: string) => {
      const roles = rolesByUser.get(uid);
      if (!roles || roles.length === 0) return false;
      return roles.length === 1 && roles[0] === "customer";
    };

    // Hide admin-only accounts from the artist filter (e.g. owner login) unless they still appear as artist on a booking.
    const isAdminOnlyForSchedule = (uid: string) => {
      const roles = rolesByUser.get(uid) ?? [];
      if (roles.includes("artist")) return false;
      return roles.includes("admin");
    };

    // Filter artists + booking dialog: not customer-only; hard-hidden (e.g. Mr.Tattooist); then booking artists;
    // then drop admin-only. Hard-hidden wins over bookingArtistIds so owner never clutters the picker.
    const team = (allProfiles || []).filter((p) => {
      if (isPureCustomerOnly(p.user_id)) return false;
      if (isHardHiddenScheduleArtist(p)) return false;
      if (bookingArtistIds.has(p.user_id)) return true;
      if (isAdminOnlyForSchedule(p.user_id)) return false;
      return true;
    });

    const teamList = team as Profile[];
    setProfiles(teamList);
    writeScheduleArtistColors(teamList);
    setProfilesReady(true);
  };

  const getArtistName = (id: string) => profiles.find((p) => p.user_id === id)?.display_name || t("schedule.unknown");

  const handleSlotClick = (date: Date, hour: number, minute?: number) => {
    setPrefillDate(date);
    setPrefillHour(hour);
    setPrefillMinute(minute);
    setEditingBooking(null);
    setDialogOpen(true);
  };

  const sendClientInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error(t("schedule.enterValidClientEmail", { defaultValue: "Enter a valid client email" }));
      return;
    }
    setInviting(true);
    const { data, error } = await supabase.functions.invoke("invite-user", {
      body: {
        email,
        inviteType: "customer",
        redirectTo: `${window.location.origin.replace(/\/$/, "")}/auth?next=/customer-profile-setup`,
      },
    });
    setInviting(false);
    if (error || data?.error) {
      toast.error((data as any)?.error || error?.message || t("schedule.inviteFailed"));
      return;
    }
    toast.success(t("schedule.inviteSent"));
    setInviteEmail("");
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-screen bg-background/35 backdrop-blur-[1px]">
        <ScheduleHeader
          view={view}
          setView={setView}
          currentDate={currentDate}
          setCurrentDate={setCurrentDate}
          onNewBooking={() => {
            setPrefillDate(undefined);
            setPrefillHour(undefined);
            setPrefillMinute(undefined);
            setEditingBooking(null);
            setDialogOpen(true);
          }}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          profiles={profiles}
          selectedArtists={selectedArtists}
          setSelectedArtists={setSelectedArtists}
          inviteEmail={inviteEmail}
          setInviteEmail={setInviteEmail}
          inviting={inviting}
          onInviteClient={sendClientInvite}
        />

        <div className="flex flex-1 overflow-hidden relative">
          <div
            className={`
            fixed inset-y-0 left-0 z-30 w-[min(100%,280px)] max-w-[85vw] bg-card/75 backdrop-blur-md border-r border-border shadow-lg overflow-hidden transition-transform md:static md:z-0 md:max-w-none md:shadow-none md:transition-[width]
            ${sidebarOpen ? "translate-x-0 md:w-[280px]" : "-translate-x-full md:translate-x-0 md:w-0"}
          `}
          >
            <ScheduleSidebar
              profiles={profiles}
              selectedArtists={selectedArtists}
              setSelectedArtists={setSelectedArtists}
              teamSearch={teamSearch}
              setTeamSearch={setTeamSearch}
              services={services}
              currentDate={currentDate}
              setCurrentDate={setCurrentDate}
            />
          </div>
          {sidebarOpen && (
            <div className="fixed inset-0 z-20 bg-black/40 md:hidden" aria-hidden onClick={() => setSidebarOpen(false)} />
          )}

          <TimeGrid
            days={days}
            bookings={bookings}
            profiles={profiles}
            profilesReady={profilesReady}
            artistColorCache={artistColorCache}
            services={services}
            selectedArtists={selectedArtists}
            onBookingClick={(booking) => setSelectedBooking(booking)}
            onSlotClick={handleSlotClick}
            view={view}
          />

          {selectedBooking && (
            <BookingDetailPanel
              booking={selectedBooking}
              artistName={getArtistName(selectedBooking.artist_id)}
              onClose={() => setSelectedBooking(null)}
              onEdit={() => {
                setEditingBooking(selectedBooking);
                setDialogOpen(true);
              }}
            />
          )}
        </div>
      </div>

      {user && (
        <BookingDialog
          open={dialogOpen}
          onOpenChange={(v) => {
            setDialogOpen(v);
            if (!v) setEditingBooking(null);
          }}
          userId={user.id}
          artists={profiles}
          prefillDate={prefillDate}
          prefillHour={prefillHour}
          prefillMinute={prefillMinute}
          services={services}
          bookingToEdit={editingBooking}
          onSaved={() => {
            fetchBookings();
            setSelectedBooking(null);
            setEditingBooking(null);
          }}
        />
      )}
    </AppLayout>
  );
};

export default SchedulePage;

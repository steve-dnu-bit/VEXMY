import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import CustomerLayout from "@/components/CustomerLayout";
import type { PortalBrandProfile } from "@/components/CustomerLayout";
import { fetchIsOnlyCustomer } from "@/hooks/useUserRoles";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { PenLine, CheckCircle2, Loader2, Printer, Download, Search, FileText } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { consentPdfBasename, downloadConsentPdf, printConsentPdf } from "@/lib/consentPdfActions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { format, parseISO } from "date-fns";
import { bookingEligibleForConsent } from "@/lib/bookingTypes";
import { buildCustomerBookingsOrFilter } from "@/lib/customerBookings";
import { bookingMatchesCustomerShop } from "@/lib/customerShops";
import { loadShopSettingsForOrganization } from "@/lib/shopSettings";
import {
  loadShopConsentTemplates,
  resolveTemplateForBooking,
  type ConsentFormTemplateRow,
} from "@/lib/shopConsentTemplates";
import { applyConsentTemplateVars } from "@/lib/consentTemplateText";
import { useCustomerShop } from "@/hooks/useCustomerShop";

const UNDER_18_QUESTION = "Are you under 18?";

type StaffConsentRow = {
  id: string;
  full_name: string;
  email: string | null;
  consent_pdf_url: string | null;
  created_at: string;
  booking_id: string | null;
  consent_fields: { consentType?: string } | null;
  booking: {
    starts_at: string;
    booking_type: string;
    service_category: string | null;
  } | null;
};

function StaffConsentList({ user }: { user: { id: string } }) {
  const [rows, setRows] = useState<StaffConsentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("consent_signatures")
        .select("id, full_name, email, consent_pdf_url, created_at, booking_id, consent_fields, booking:bookings!booking_id(starts_at, booking_type, service_category)" as any)
        .eq("artist_id", user.id)
        .order("created_at", { ascending: false });
      if (error) {
        toast.error(error.message || "Could not load consent forms");
      } else {
        setRows((data || []) as unknown as StaffConsentRow[]);
      }
      setLoading(false);
    })();
  }, [user.id]);

  const filtered = search.trim()
    ? rows.filter((r) => r.full_name.toLowerCase().includes(search.trim().toLowerCase()))
    : rows;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-gold">Signed consent forms</h1>
          <p className="text-sm text-muted-foreground mt-1">View, print, or download consent PDFs for your bookings.</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client name…"
            className="pl-9 field-surface border-border"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {search.trim() ? "No consent forms match your search." : "No signed consent forms yet."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((row) => {
              const consentType = (row.consent_fields as any)?.consentType ||
                (row.booking?.service_category || "").toLowerCase() ||
                "tattoo";
              const bookingDate = row.booking?.starts_at
                ? format(parseISO(row.booking.starts_at), "EEE d MMM yyyy")
                : null;

              return (
                <Card key={row.id}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{row.full_name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Signed {format(parseISO(row.created_at), "d MMM yyyy, HH:mm")}
                          {bookingDate ? ` · Booking: ${bookingDate}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {consentType === "piercing" ? "Piercing" : "Tattoo"} consent
                          {row.email ? ` · ${row.email}` : ""}
                        </p>
                      </div>
                      {row.consent_pdf_url ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0"
                            title="Print"
                            onClick={() => printConsentPdf(row.consent_pdf_url!)}
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0"
                            title="Download"
                            disabled={busyId === row.id}
                            onClick={async () => {
                              setBusyId(row.id);
                              try {
                                const base = consentPdfBasename(row.full_name, row.created_at);
                                const ok = await downloadConsentPdf(row.consent_pdf_url!, base);
                                if (!ok) toast.info("Opened in a new tab — use Save as to download.");
                              } finally {
                                setBusyId(null);
                              }
                            }}
                          >
                            {busyId === row.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Download className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground shrink-0">No PDF</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

type ConsentBooking = {
  id: string;
  artist_id: string;
  organization_id: string | null;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  tattoo_style: string | null;
  tattoo_size: string | null;
  tattoo_placement: string | null;
  notes: string | null;
  booking_type: string;
  service_category: string;
  status: string;
  starts_at: string;
  ends_at: string;
  reference_image_url: string | null;
};

const ConsentPage = () => {
  const { user, loading: authLoading } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { selectedOrgId, shops, selectedShop, loading: shopLoading } = useCustomerShop();
  const [searchParams] = useSearchParams();
  const [onlyCustomer, setOnlyCustomer] = useState<boolean | null>(null);

  const [bookings, setBookings] = useState<ConsentBooking[]>([]);
  const [selectedBookingId, setSelectedBookingId] = useState<string>("");

  const selectedBooking = useMemo(
    () => bookings.find((b) => b.id === selectedBookingId) ?? null,
    [bookings, selectedBookingId]
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigWrapRef = useRef<HTMLDivElement>(null);
  const canvasLogicalRef = useRef({ w: 600, h: 200 });
  const hasSignedRef = useRef(false);
  const drawingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [consentPdfUrl, setConsentPdfUrl] = useState<string | null>(null);
  const [portalBrand, setPortalBrand] = useState<PortalBrandProfile | null>(null);
  const [consentTemplates, setConsentTemplates] = useState<ConsentFormTemplateRow[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<ConsentFormTemplateRow | null>(null);
  const [bookingOrgShopName, setBookingOrgShopName] = useState("");

  const artistDisplayName = portalBrand?.display_name?.trim() || "";

  const shopDisplayName = useMemo(() => {
    if (bookingOrgShopName) return bookingOrgShopName;
    if (!selectedBooking?.organization_id) return selectedShop?.shopName?.trim() || "";
    return (
      shops.find((s) => s.organizationId === selectedBooking.organization_id)?.shopName?.trim() ||
      selectedShop?.shopName?.trim() ||
      ""
    );
  }, [bookingOrgShopName, selectedBooking?.organization_id, shops, selectedShop?.shopName]);

  const resolvedTemplateContent = useMemo(() => {
    if (!activeTemplate) return null;
    return applyConsentTemplateVars(
      activeTemplate.content,
      {
        shopName: shopDisplayName,
        artistName: artistDisplayName,
      },
      activeTemplate.slug,
    );
  }, [activeTemplate, shopDisplayName, artistDisplayName]);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [dob, setDob] = useState("");
  const [treatmentLocation, setTreatmentLocation] = useState("");
  const [guardianName, setGuardianName] = useState("");

  const [agreed, setAgreed] = useState(false);
  const [yesAnswers, setYesAnswers] = useState<Record<string, boolean>>({});
  const [photoConsent, setPhotoConsent] = useState(false);
  const [soberConsent, setSoberConsent] = useState(false);
  const [ageConsent, setAgeConsent] = useState(false);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);

  useEffect(() => {
    if (!onlyCustomer) return;
    void loadShopConsentTemplates(false, selectedOrgId).then(setConsentTemplates);
  }, [onlyCustomer, selectedOrgId]);

  useEffect(() => {
    if (!selectedBooking || consentTemplates.length === 0) {
      setActiveTemplate(null);
      return;
    }
    const formSlug = searchParams.get("form")?.trim().toLowerCase() || null;
    const resolved = resolveTemplateForBooking(
      consentTemplates,
      selectedBooking.service_category,
      selectedBooking.booking_type,
      formSlug,
    );
    setActiveTemplate(resolved);
  }, [selectedBooking, consentTemplates, searchParams]);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = sigWrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = wrap.getBoundingClientRect();
    const cw = Math.max(280, Math.floor(rect.width));
    const ch = Math.max(112, Math.floor(rect.height));
    canvasLogicalRef.current = { w: cw, h: ch };

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = "#0d9488";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    hasSignedRef.current = false;
  }, []);

  useEffect(() => {
    setupCanvas();
    const wrap = sigWrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => setupCanvas());
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [setupCanvas]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setupCanvas());
    return () => cancelAnimationFrame(id);
  }, [activeTemplate?.slug, setupCanvas]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const { w, h } = canvasLogicalRef.current;
    const rect = canvas.getBoundingClientRect();
    const rw = Math.max(rect.width, 1);
    const rh = Math.max(rect.height, 1);
    return {
      x: ((e.clientX - rect.left) / rw) * w,
      y: ((e.clientY - rect.top) / rh) * h,
    };
  };

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    hasSignedRef.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDraw = () => {
    drawingRef.current = false;
  };
  const clearSignature = () => setupCanvas();

  useEffect(() => {
    if (!user) return;
    (async () => {
      const only = await fetchIsOnlyCustomer(user.id);
      setOnlyCustomer(only);
      if (!only) return;
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, artist_id, organization_id, client_name, client_email, client_phone, tattoo_style, tattoo_size, tattoo_placement, notes, booking_type, service_category, status, starts_at, ends_at, reference_image_url"
        )
        .or(buildCustomerBookingsOrFilter(user.id, user.email))
        .order("starts_at", { ascending: true });

      if (error) {
        toast.error(error.message || "Failed to load bookings");
        return;
      }

      const list = ((data ?? []) as ConsentBooking[])
        .filter(bookingEligibleForConsent)
        .filter((b) => bookingMatchesCustomerShop(b.organization_id, selectedOrgId, shops.length));
      setBookings(list);
      const wanted = searchParams.get("bookingId")?.trim();
      if (wanted && list.some((row) => row.id === wanted)) {
        setSelectedBookingId(wanted);
      } else {
        setSelectedBookingId((prev) => (prev && list.some((row) => row.id === prev) ? prev : list[0]?.id ?? ""));
      }
    })();
  }, [user, searchParams, selectedOrgId, shops.length]);

  useEffect(() => {
    if (!selectedBooking) return;
    setFullName(selectedBooking.client_name ?? "");
    setEmail(selectedBooking.client_email ?? user?.email ?? "");
    setPhone(selectedBooking.client_phone ?? "");
    setTreatmentLocation(selectedBooking.tattoo_placement ?? "");
  }, [selectedBooking, user]);

  useEffect(() => {
    if (!selectedBooking?.organization_id) {
      setBookingOrgShopName("");
      return;
    }
    void loadShopSettingsForOrganization(selectedBooking.organization_id).then((shop) => {
      setBookingOrgShopName(shop?.shop_name?.trim() || shop?.trading_name?.trim() || "");
    });
  }, [selectedBooking?.organization_id]);

  useEffect(() => {
    if (!selectedBooking?.artist_id) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select(
          "display_name, avatar_url, portal_public_bio, portal_bg_color, portal_bg_image_url, public_contact_email, public_contact_phone, public_instagram",
        )
        .eq("user_id", selectedBooking.artist_id)
        .maybeSingle();
      setPortalBrand((data as PortalBrandProfile) || null);
    })();
  }, [selectedBooking?.artist_id]);

  const submit = async () => {
    if (!selectedBooking) {
      toast.error("Select a booking first");
      return;
    }
    if (!fullName.trim()) {
      toast.error("Please enter your full legal name");
      return;
    }
    if (!agreed) {
      toast.error("Please confirm you have read and agree to the consent");
      return;
    }
    if (!hasSignedRef.current) {
      toast.error("Please sign in the signature area");
      return;
    }
    if (!email.trim()) {
      toast.error("Email is required so we can notify the studio");
      return;
    }
    if (!photoConsent || !soberConsent || !ageConsent || !riskAcknowledged) {
      toast.error("Please confirm all mandatory declarations");
      return;
    }
    if (!activeTemplate) {
      toast.error("Consent form could not be loaded");
      return;
    }
    if (yesAnswers[UNDER_18_QUESTION] && !guardianName.trim()) {
      toast.error("Guardian name is required for under 18 consent");
      return;
    }

    setSubmitting(true);
    try {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Signature canvas missing");
      const signatureImage = canvas.toDataURL("image/png");

      const { data, error } = await supabase.functions.invoke("submit-consent", {
        body: {
          bookingId: selectedBooking.id,
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          agreementVersion: activeTemplate.version,
          templateSlug: activeTemplate.slug,
          consentType: activeTemplate.slug,
          consentFields: {
            artistName: artistDisplayName || null,
            shopName: shopDisplayName || null,
            address: address.trim() || null,
            dob: dob || null,
            treatmentLocation: treatmentLocation.trim() || null,
            guardianName: guardianName.trim() || null,
            healthAnswers: yesAnswers,
            declarations: {
              agreed,
              photoConsent,
              soberConsent,
              ageConsent,
              riskAcknowledged,
            },
          },
          signatureImage,
        },
      });

      if (error) throw error;
      setConsentPdfUrl(data?.consentPdfUrl ?? null);
      setDone(true);
      if (data && (data as { pdfSaved?: boolean }).pdfSaved === false) {
        const gen = (data as { pdfGenerationError?: string }).pdfGenerationError;
        const up = (data as { pdfUploadError?: string }).pdfUploadError;
        const detail = gen || up || "Unknown reason";
        toast.warning(`Consent saved, but the PDF file was not stored (${detail}). The studio can check Supabase logs and storage.`);
      } else {
        toast.success("Consent submitted. Thank you.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not submit consent");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || permLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  if (onlyCustomer === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  if (onlyCustomer && shopLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-base">Consent access</CardTitle>
            <CardDescription>Please sign in to submit your consent form.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="gold-outline" className="w-full">
              <Link to="/auth">Sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!onlyCustomer) {
    return <StaffConsentList user={user} />;
  }

  if (done) {
    return (
      <CustomerLayout portalBrand={portalBrand}>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-primary" />
            <div>
              <h1 className="font-display text-xl font-bold">Consent submitted</h1>
              <p className="text-sm text-muted-foreground">Your signed consent form has been saved and emailed.</p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your signed PDF</CardTitle>
              <CardDescription>Generated from the studio consent template.</CardDescription>
            </CardHeader>
            <CardContent>
              {consentPdfUrl ? (
                <a
                  href={consentPdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline break-all"
                >
                  View signed consent PDF
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">Signature recorded successfully.</p>
              )}
              <div className="mt-4">
                <Button asChild variant="outline" className="w-full">
                  <Link to="/account">Back to my account</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout portalBrand={portalBrand}>
      <div className="space-y-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-gold">{activeTemplate?.content.formTitle ?? "Consent form"}</h1>
          <p className="text-sm text-muted-foreground mt-1">Fill the form and sign. No reference image or ID upload is required.</p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">1) Choose your appointment</CardTitle>
            <CardDescription>We’ll use the selected booking to send the consent to the artist and to your email.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {bookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bookings found for your account.</p>
            ) : (
              <>
                {bookings.length > 1 ? (
                  <div>
                    <Label>Booking</Label>
                    <Select value={selectedBookingId} onValueChange={setSelectedBookingId}>
                      <SelectTrigger className="mt-1 field-surface border-border">
                        <SelectValue placeholder="Select booking" />
                      </SelectTrigger>
                      <SelectContent>
                        {bookings.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                      {format(parseISO(b.starts_at), "EEE d MMM")} · {format(parseISO(b.starts_at), "h:mm a")}{" "}
                      · {(b.service_category || "").toLowerCase() === "piercing" ? "Piercing" : "Tattoo"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {selectedBooking ? (
                  <div className="rounded-lg border border-border bg-secondary/20 p-3">
                    <p className="text-sm font-semibold">{selectedBooking.client_name}</p>
                    {shopDisplayName ? (
                      <p className="text-sm text-foreground mt-1">
                        Organization: <span className="font-medium">{shopDisplayName}</span>
                      </p>
                    ) : null}
                    {artistDisplayName ? (
                      <p className="text-sm text-foreground mt-1">
                        Artist: <span className="font-medium">{artistDisplayName}</span>
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(selectedBooking.starts_at), "EEE d MMM yyyy")} · {selectedBooking.booking_type} ·{" "}
                      {selectedBooking.service_category || "tattoo"} · {selectedBooking.status}
                    </p>
                    {selectedBooking.tattoo_style ? (
                      <p className="text-xs text-muted-foreground mt-1">Style: {selectedBooking.tattoo_style}</p>
                    ) : null}
                    {selectedBooking.tattoo_placement ? (
                      <p className="text-xs text-muted-foreground">Placement: {selectedBooking.tattoo_placement}</p>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">2) Medical and treatment questions</CardTitle>
            <CardDescription>Do you suffer from or are you: Yes / No</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(activeTemplate?.content.healthQuestions ?? []).map((question) => (
              <div key={question} className="rounded-md border border-border p-3">
                <p className="text-sm font-medium mb-2 leading-snug">{question}</p>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={question}
                      checked={yesAnswers[question] === true}
                      onChange={() => setYesAnswers((prev) => ({ ...prev, [question]: true }))}
                    />
                    Yes
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={question}
                      checked={yesAnswers[question] === false}
                      onChange={() => setYesAnswers((prev) => ({ ...prev, [question]: false }))}
                    />
                    No
                  </label>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">3) Your details</CardTitle>
            <CardDescription>Fields are saved with your submission.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {shopDisplayName ? (
              <div>
                <Label>Organization / studio</Label>
                <Input value={shopDisplayName} readOnly className="mt-1/60" tabIndex={-1} />
              </div>
            ) : null}
            {artistDisplayName ? (
              <div>
                <Label>Artist / practitioner</Label>
                <Input value={artistDisplayName} readOnly className="mt-1/60" tabIndex={-1} />
              </div>
            ) : null}
            <div>
              <Label htmlFor="fullName">Full legal name *</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1"
                autoComplete="name"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" placeholder="optional" />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" type="email" />
              </div>
            </div>
            <div>
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1" placeholder="optional" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="dob">Date of birth</Label>
                <Input id="dob" value={dob} onChange={(e) => setDob(e.target.value)} className="mt-1" type="date" />
              </div>
              <div>
                <Label htmlFor="placement">{activeTemplate?.content.placementLabel ?? "Treatment location / description"}</Label>
                <Input
                  id="placement"
                  value={treatmentLocation}
                  onChange={(e) => setTreatmentLocation(e.target.value)}
                  className="mt-1"
                  placeholder="e.g. Forearm or Lobe"
                />
              </div>
            </div>
            {yesAnswers[UNDER_18_QUESTION] ? (
              <div>
                <Label htmlFor="guardianName">Parent / legal guardian print name</Label>
                <Input id="guardianName" value={guardianName} onChange={(e) => setGuardianName(e.target.value)} className="mt-1" />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PenLine className="h-4 w-4 text-primary" />
              4) Signature
            </CardTitle>
            <CardDescription>Draw your signature below.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div
              ref={sigWrapRef}
              className="rounded-lg border-2 border-dashed border-border bg-secondary/20 touch-none relative w-full h-[6.75rem] sm:h-[7.5rem] max-w-[75%] mx-auto"
            >
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full cursor-crosshair block touch-none"
                onPointerDown={startDraw}
                onPointerMove={draw}
                onPointerUp={endDraw}
                onPointerCancel={endDraw}
                onPointerLeave={endDraw}
              />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={clearSignature} className="w-full">
              Clear signature
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">5) Consent declarations</CardTitle>
            <CardDescription>Please read these statements carefully before signing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {resolvedTemplateContent?.introText ? (
              <p className="text-sm leading-snug text-foreground border border-border rounded-md p-3 bg-secondary/20">
                {resolvedTemplateContent.introText}
              </p>
            ) : null}
            <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
              {(resolvedTemplateContent?.statements ?? activeTemplate?.content.statements ?? []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-2 rounded-lg border border-border p-3 bg-secondary/20">
          <div className="flex items-start gap-3">
            <Checkbox id="agree" checked={agreed} onCheckedChange={(c) => setAgreed(c === true)} className="mt-0.5" />
            <Label htmlFor="agree" className="text-sm font-normal leading-snug cursor-pointer">
              {resolvedTemplateContent?.declarations.agree ?? activeTemplate?.content.declarations.agree}
            </Label>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox id="age-consent" checked={ageConsent} onCheckedChange={(c) => setAgeConsent(c === true)} className="mt-0.5" />
            <Label htmlFor="age-consent" className="text-sm font-normal leading-snug cursor-pointer">
              {resolvedTemplateContent?.declarations.age ?? activeTemplate?.content.declarations.age}
            </Label>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox id="sober-consent" checked={soberConsent} onCheckedChange={(c) => setSoberConsent(c === true)} className="mt-0.5" />
            <Label htmlFor="sober-consent" className="text-sm font-normal leading-snug cursor-pointer">
              {resolvedTemplateContent?.declarations.sober ?? activeTemplate?.content.declarations.sober}
            </Label>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox id="risk-consent" checked={riskAcknowledged} onCheckedChange={(c) => setRiskAcknowledged(c === true)} className="mt-0.5" />
            <Label htmlFor="risk-consent" className="text-sm font-normal leading-snug cursor-pointer">
              {resolvedTemplateContent?.declarations.risk ?? activeTemplate?.content.declarations.risk}
            </Label>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox id="photo-consent" checked={photoConsent} onCheckedChange={(c) => setPhotoConsent(c === true)} className="mt-0.5" />
            <Label htmlFor="photo-consent" className="text-sm font-normal leading-snug cursor-pointer">
              {resolvedTemplateContent?.declarations.photo ?? activeTemplate?.content.declarations.photo}
            </Label>
          </div>
        </div>

        <Button onClick={submit} disabled={submitting} className="w-full h-12 text-base">
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Submitting…
            </>
          ) : (
            "Submit signed consent"
          )}
        </Button>
      </div>
    </CustomerLayout>
  );
};

export default ConsentPage;

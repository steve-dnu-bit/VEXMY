import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, Clock, Landmark, LayoutDashboard, MapPin, Palette, CheckCircle2, Users } from "lucide-react";
import StripeConnectCard from "@/components/subscription/StripeConnectCard";
import OrgPosSetupChecklist from "@/components/pos/OrgPosSetupChecklist";
import { TapToPayWaveIcon } from "@/components/pos/TapToPayWaveIcon";
import { isIpadDevice, isNativeApp, nativePlatform } from "@/lib/platform";
import { tapToPayOnIphoneLabel } from "@/lib/terminal/tapToPayLabels";
import i18n from "@/i18n";
import {
  completeShopSetup,
  loadShopSettings,
  needsShopSetup,
  saveShopSettings,
  shopRowToWizardData,
  type ShopSetupWizardData,
} from "@/lib/shopSettings";
import {
  defaultShopScheduleHours,
  loadShopScheduleHours,
  saveShopScheduleHours,
  type ShopScheduleHours,
} from "@/lib/shopScheduleHours";
import {
  defaultShopDashboardThemeSettings,
  loadShopDashboardThemeSettings,
  saveShopDashboardThemeSettings,
  type DashboardThemeMode,
  type ShopDashboardThemeSettings,
} from "@/lib/shopDashboardTheme";
import { uploadFileToUploads } from "@/lib/uploadStorage";
import {
  SHOP_COUNTRIES,
  currencyForShopCountry,
  formatShopMoney,
  normalizeShopCountryCode,
  type ShopCountryCode,
} from "@/lib/shopCurrency";
import { detectShopCountryFromIp, shouldSuggestCountryFromGeo } from "@/lib/detectShopCountry";
import { THEME_PRESETS } from "@/lib/themePresets";
import { applyOwnerPractitionerChoice } from "@/lib/ownerPractitioner";
import { useArtistSeats } from "@/hooks/useSubscription";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const STEPS = ["brand", "contact", "team", "billing", "payouts", "hours", "look", "review"] as const;
type Step = (typeof STEPS)[number];

const ShopSetupWizardPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [step, setStep] = useState<Step>("brand");
  const [shopId, setShopId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [form, setForm] = useState<ShopSetupWizardData>({
    shop_name: "",
    trading_name: "",
    legal_name: "",
    logo_url: "",
    support_email: "",
    phone: "",
    website_url: "",
    address_line1: "",
    address_line2: "",
    city: "",
    postcode: "",
    country: "UK" as ShopCountryCode,
    company_name: "",
    company_legal_name: "",
  });

  const [scheduleHours, setScheduleHours] = useState<ShopScheduleHours>(defaultShopScheduleHours);
  const [dashboardTheme, setDashboardTheme] = useState<ShopDashboardThemeSettings>(defaultShopDashboardThemeSettings);
  const [countrySuggestedFromGeo, setCountrySuggestedFromGeo] = useState(false);
  const [ownerIsPractitioner, setOwnerIsPractitioner] = useState<boolean | null>(null);
  const { data: seatUsage } = useArtistSeats();

  useEffect(() => {
    const stepParam = searchParams.get("step");
    if (stepParam && (STEPS as readonly string[]).includes(stepParam)) {
      setStep(stepParam as Step);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const required = await needsShopSetup(user.id);
      if (!required) {
        navigate("/schedule", { replace: true });
        return;
      }

      const [shop, companyRes, hours, theme] = await Promise.all([
        loadShopSettings(user.id),
        supabase.from("companies").select("id, name, legal_name").order("created_at", { ascending: true }).limit(1),
        loadShopScheduleHours(),
        loadShopDashboardThemeSettings(),
      ]);

      if (shop) {
        setShopId(shop.id);
        const wizardData = shopRowToWizardData(shop, companyRes.data?.[0] ?? null);
        setForm({
          ...wizardData,
          support_email: wizardData.support_email || user.email || "",
        });
        if (shop.owner_is_practitioner != null) {
          setOwnerIsPractitioner(shop.owner_is_practitioner);
        }
      }

      if (shouldSuggestCountryFromGeo(shop)) {
        const geo = await detectShopCountryFromIp();
        if (geo) {
          setForm((prev) => ({ ...prev, country: geo.shopCountry }));
          setCountrySuggestedFromGeo(true);
        }
      }

      if (companyRes.data?.[0]?.id) setCompanyId(companyRes.data[0].id);
      setScheduleHours(hours);
      setDashboardTheme(theme);
      setLoading(false);
    })();
  }, [user, navigate]);

  const stepIndex = STEPS.indexOf(step);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  const patchForm = (patch: Partial<ShopSetupWizardData>) => setForm((prev) => ({ ...prev, ...patch }));

  const uploadLogo = async (file: File) => {
    if (!user) return;
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `shop_logos/${user.id}-${Date.now()}.${ext}`;
      const storageRef = await uploadFileToUploads(path, file);
      patchForm({ logo_url: storageRef });
      toast.success(t("setup.logoUploaded"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("settings.uploadFailed"));
    } finally {
      setUploadingLogo(false);
    }
  };

  const persistBrand = async () => {
    if (!shopId || !form.shop_name.trim()) {
      toast.error(t("setup.shopNameRequired"));
      return false;
    }
    const { error } = await saveShopSettings(shopId, {
      shop_name: form.shop_name.trim(),
      trading_name: form.trading_name.trim() || form.shop_name.trim(),
      legal_name: form.legal_name.trim() || form.shop_name.trim(),
      logo_url: form.logo_url.trim() || null,
    });
    if (error) {
      toast.error(error);
      return false;
    }
    const orgId = (await loadShopSettings())?.organization_id;
    if (orgId) {
      await supabase.from("organizations").update({ name: form.shop_name.trim() }).eq("id", orgId);
    }
    return true;
  };

  const persistContact = async () => {
    if (!shopId) return false;
    const { error } = await saveShopSettings(shopId, {
      support_email: form.support_email.trim() || null,
      phone: form.phone.trim() || null,
      website_url: form.website_url.trim() || null,
      address_line1: form.address_line1.trim() || null,
      address_line2: form.address_line2.trim() || null,
      city: form.city.trim() || null,
      postcode: form.postcode.trim() || null,
      country: normalizeShopCountryCode(form.country),
      country_code: normalizeShopCountryCode(form.country),
    });
    if (error) {
      toast.error(error);
      return false;
    }
    return true;
  };

  const persistTeam = async () => {
    if (!shopId || !user) return false;
    if (ownerIsPractitioner === null) {
      toast.error(t("setup.practitionerRequired"));
      return false;
    }
    const { error } = await applyOwnerPractitionerChoice(user.id, shopId, ownerIsPractitioner);
    if (error) {
      toast.error(error);
      return false;
    }
    return true;
  };

  const persistBilling = async () => {
    if (!shopId) return false;
    if (!form.company_name.trim() || !form.company_legal_name.trim()) {
      toast.error(t("setup.billingRequired"));
      return false;
    }
    const { error: shopErr } = await saveShopSettings(shopId, {
      legal_name: form.company_legal_name.trim(),
      trading_name: form.company_name.trim(),
    });
    if (shopErr) {
      toast.error(shopErr);
      return false;
    }
    if (companyId) {
      const { error } = await supabase
        .from("companies")
        .update({ name: form.company_name.trim(), legal_name: form.company_legal_name.trim() })
        .eq("id", companyId);
      if (error) {
        toast.error(error.message);
        return false;
      }
    } else {
      const { data, error } = await supabase
        .from("companies")
        .insert({ name: form.company_name.trim(), legal_name: form.company_legal_name.trim() })
        .select("id")
        .single();
      if (error) {
        toast.error(error.message);
        return false;
      }
      setCompanyId(data.id);
    }
    return true;
  };

  const persistHours = async () => {
    const { error } = await saveShopScheduleHours(scheduleHours);
    if (error) {
      toast.error(error);
      return false;
    }
    return true;
  };

  const persistLook = async () => {
    const { error } = await saveShopDashboardThemeSettings(dashboardTheme);
    if (error) {
      toast.error(error);
      return false;
    }
    return true;
  };

  const goNext = async () => {
    if (!shopId) return;
    setSaving(true);
    let ok = true;
    if (step === "brand") ok = await persistBrand();
    else if (step === "contact") ok = await persistContact();
    else if (step === "team") ok = await persistTeam();
    else if (step === "billing") ok = await persistBilling();
    else if (step === "hours") ok = await persistHours();
    else if (step === "look") ok = await persistLook();
    setSaving(false);
    if (!ok) return;
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next);
  };

  const goBack = () => {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev);
  };

  const finishSetup = async () => {
    if (!shopId) return;
    setSaving(true);
    const ok =
      (await persistBrand()) &&
      (await persistContact()) &&
      (await persistTeam()) &&
      (await persistBilling()) &&
      (await persistHours()) &&
      (await persistLook());
    if (!ok) {
      setSaving(false);
      return;
    }
    const { error } = await completeShopSetup(shopId);
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(t("setup.completeToast"));
    navigate("/schedule", { replace: true });
  };

  const stepMeta: Record<Step, { title: string; desc: string; icon: typeof Building2 }> = {
    brand: { title: t("setup.stepBrandTitle"), desc: t("setup.stepBrandDesc"), icon: Palette },
    contact: { title: t("setup.stepContactTitle"), desc: t("setup.stepContactDesc"), icon: MapPin },
    team: { title: t("setup.stepTeamTitle"), desc: t("setup.stepTeamDesc"), icon: Users },
    billing: { title: t("setup.stepBillingTitle"), desc: t("setup.stepBillingDesc"), icon: Building2 },
    payouts: { title: t("setup.stepPayoutsTitle"), desc: t("setup.stepPayoutsDesc"), icon: Landmark },
    hours: { title: t("setup.stepHoursTitle"), desc: t("setup.stepHoursDesc"), icon: Clock },
    look: { title: t("setup.stepLookTitle"), desc: t("setup.stepLookDesc"), icon: LayoutDashboard },
    review: { title: t("setup.stepReviewTitle"), desc: t("setup.stepReviewDesc"), icon: CheckCircle2 },
  };

  if (loading) {
    return (
      <MarketingLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        </div>
      </MarketingLayout>
    );
  }

  const Icon = stepMeta[step].icon;

  return (
    <MarketingLayout>
      <section className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold/80">{t("setup.label")}</p>
          <h1 className="mt-2 font-display text-3xl font-bold">{t("setup.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("setup.subtitle")}</p>
        </div>

        <div className="mb-6 h-1.5 rounded-full bg-secondary overflow-hidden">
          <div className="h-full bg-gold transition-all" style={{ width: `${progress}%` }} />
        </div>

        <Card className="border-border bg-card/90">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Icon className="h-5 w-5 text-gold" />
              {stepMeta[step].title}
            </CardTitle>
            <CardDescription>{stepMeta[step].desc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === "brand" ? (
              <>
                <div>
                  <Label>{t("setup.shopName")}</Label>
                  <Input className="mt-1" value={form.shop_name} onChange={(e) => patchForm({ shop_name: e.target.value })} />
                </div>
                <div>
                  <Label>{t("setup.tradingName")}</Label>
                  <Input className="mt-1" value={form.trading_name} onChange={(e) => patchForm({ trading_name: e.target.value })} placeholder={form.shop_name} />
                </div>
                <div>
                  <Label>{t("setup.logo")}</Label>
                  <div className="mt-2 flex items-center gap-4">
                    {form.logo_url ? (
                      <img src={form.logo_url} alt="" className="h-16 w-16 rounded-lg object-cover border border-border" />
                    ) : (
                      <div className="h-16 w-16 rounded-lg border border-dashed border-border bg-secondary/40" />
                    )}
                    <Button type="button" variant="outline" disabled={uploadingLogo} onClick={() => logoInputRef.current?.click()}>
                      {uploadingLogo ? t("settings.uploading") : t("setup.uploadLogo")}
                    </Button>
                    <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); e.currentTarget.value = ""; }} />
                  </div>
                </div>
              </>
            ) : null}

            {step === "contact" ? (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>{t("setup.supportEmail")}</Label>
                    <Input type="email" className="mt-1" value={form.support_email} onChange={(e) => patchForm({ support_email: e.target.value })} />
                  </div>
                  <div>
                    <Label>{t("setup.phone")}</Label>
                    <Input className="mt-1" value={form.phone} onChange={(e) => patchForm({ phone: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>{t("setup.website")}</Label>
                  <Input className="mt-1" value={form.website_url} onChange={(e) => patchForm({ website_url: e.target.value })} placeholder="https://" />
                </div>
                <div>
                  <Label>{t("setup.addressLine1")}</Label>
                  <Input className="mt-1" value={form.address_line1} onChange={(e) => patchForm({ address_line1: e.target.value })} />
                </div>
                <div>
                  <Label>{t("setup.addressLine2")}</Label>
                  <Input className="mt-1" value={form.address_line2} onChange={(e) => patchForm({ address_line2: e.target.value })} />
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <Label>{t("setup.city")}</Label>
                    <Input className="mt-1" value={form.city} onChange={(e) => patchForm({ city: e.target.value })} />
                  </div>
                  <div>
                    <Label>{t("setup.postcode")}</Label>
                    <Input className="mt-1" value={form.postcode} onChange={(e) => patchForm({ postcode: e.target.value })} />
                  </div>
                  <div>
                    <Label>{t("setup.country")}</Label>
                    <Select
                      value={normalizeShopCountryCode(form.country)}
                      onValueChange={(code) => {
                        setCountrySuggestedFromGeo(false);
                        patchForm({ country: code as ShopCountryCode });
                      }}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder={t("setup.country")} />
                      </SelectTrigger>
                      <SelectContent>
                        {SHOP_COUNTRIES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.label} ({c.currency.toUpperCase()})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("setup.currencyHint", {
                        currency: formatShopMoney(50, currencyForShopCountry(form.country)),
                      })}
                    </p>
                    {countrySuggestedFromGeo ? (
                      <p className="mt-1 text-xs text-muted-foreground">{t("setup.countryGeoHint")}</p>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}

            {step === "team" ? (
              <>
                <div>
                  <Label>{t("setup.practitionerQuestion")}</Label>
                  <RadioGroup
                    className="mt-3 space-y-3"
                    value={ownerIsPractitioner === null ? undefined : ownerIsPractitioner ? "yes" : "no"}
                    onValueChange={(value) => setOwnerIsPractitioner(value === "yes")}
                  >
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4 has-[:checked]:border-gold has-[:checked]:bg-gold/5">
                      <RadioGroupItem value="yes" className="mt-0.5" />
                      <div>
                        <p className="font-medium">{t("setup.practitionerYes")}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{t("setup.practitionerYesHint")}</p>
                      </div>
                    </label>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4 has-[:checked]:border-gold has-[:checked]:bg-gold/5">
                      <RadioGroupItem value="no" className="mt-0.5" />
                      <div>
                        <p className="font-medium">{t("setup.practitionerNo")}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{t("setup.practitionerNoHint")}</p>
                      </div>
                    </label>
                  </RadioGroup>
                </div>
                {seatUsage?.max != null ? (
                  <p className="text-xs text-muted-foreground">
                    {t("setup.practitionerSeatsHint", { max: seatUsage.max })}
                  </p>
                ) : null}
              </>
            ) : null}

            {step === "billing" ? (
              <>
                <div>
                  <Label>{t("setup.companyDisplayName")}</Label>
                  <Input className="mt-1" value={form.company_name} onChange={(e) => patchForm({ company_name: e.target.value })} />
                </div>
                <div>
                  <Label>{t("setup.companyLegalName")}</Label>
                  <Input className="mt-1" value={form.company_legal_name} onChange={(e) => patchForm({ company_legal_name: e.target.value })} placeholder="Studio Name Ltd" />
                </div>
                <p className="text-xs text-muted-foreground">{t("setup.billingHint")}</p>
              </>
            ) : null}

            {step === "payouts" ? (
              <>
                <StripeConnectCard
                  compact
                  returnPath="/shop-setup?step=payouts"
                  refreshPath="/shop-setup?step=payouts"
                />
                <p className="text-xs text-muted-foreground">{t("setup.stepPayoutsSkipHint")}</p>
                <div className="pt-4 border-t border-border space-y-3">
                  <div>
                    <p className="text-sm font-medium">{t("setup.stepPosOptionalTitle")}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t("setup.stepPosOptionalDesc")}</p>
                  </div>
                  <OrgPosSetupChecklist interactive />
                  {isNativeApp() && nativePlatform() === "ios" && !isIpadDevice() ? (
                    <div className="rounded-lg border border-border p-4 space-y-2">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <TapToPayWaveIcon className="h-4 w-4" />
                        {t("pos.setupEnableTapToPayTitle")}
                      </p>
                      <p className="text-xs text-muted-foreground">{t("pos.setupEnableTapToPayDesc")}</p>
                      <Button
                        type="button"
                        variant="gold"
                        size="sm"
                        onClick={() => navigate("/checkout?enableTapToPay=1")}
                      >
                        {tapToPayOnIphoneLabel(i18n.language)}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}

            {step === "hours" ? (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>{t("admin.scheduleOpenTime")}</Label>
                    <Input type="time" step={900} className="mt-1" value={scheduleHours.openTime} onChange={(e) => setScheduleHours((h) => ({ ...h, openTime: e.target.value }))} />
                  </div>
                  <div>
                    <Label>{t("admin.scheduleCloseTime")}</Label>
                    <Input type="time" step={900} className="mt-1" value={scheduleHours.closeTime} onChange={(e) => setScheduleHours((h) => ({ ...h, closeTime: e.target.value }))} />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>{t("admin.scheduleExtraBuffer")}</Label>
                    <Select value={String(scheduleHours.extraBufferMinutes)} onValueChange={(v) => setScheduleHours((h) => ({ ...h, extraBufferMinutes: Number(v) }))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">{t("admin.scheduleBufferNone")}</SelectItem>
                        <SelectItem value="30">{t("admin.scheduleBuffer30")}</SelectItem>
                        <SelectItem value="60">{t("admin.scheduleBuffer60")}</SelectItem>
                        <SelectItem value="90">{t("admin.scheduleBuffer90")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t("admin.scheduleBufferAt")}</Label>
                    <Select value={scheduleHours.extraBufferAt} onValueChange={(v) => setScheduleHours((h) => ({ ...h, extraBufferAt: v as ShopScheduleHours["extraBufferAt"] }))} disabled={scheduleHours.extraBufferMinutes === 0}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="start">{t("admin.scheduleBufferBeforeOpen")}</SelectItem>
                        <SelectItem value="end">{t("admin.scheduleBufferAfterClose")}</SelectItem>
                        <SelectItem value="both">{t("admin.scheduleBufferBeforeAndAfter")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            ) : null}

            {step === "look" ? (
              <>
                <div>
                  <Label>{t("admin.dashboardThemeMode")}</Label>
                  <Select value={dashboardTheme.mode} onValueChange={(v) => setDashboardTheme((d) => ({ ...d, mode: (v === "shop" ? "shop" : "per_artist") as DashboardThemeMode }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_artist">{t("admin.dashboardThemePerArtist")}</SelectItem>
                      <SelectItem value="shop">{t("admin.dashboardThemeShopWide")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {dashboardTheme.mode === "shop" ? (
                  <div>
                    <Label>{t("admin.dashboardThemePresets")}</Label>
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {THEME_PRESETS.slice(0, 8).map((preset) => (
                        <button
                          key={preset.key}
                          type="button"
                          onClick={() => setDashboardTheme((d) => ({ ...d, portalBgColor: preset.bgColor }))}
                          className={`rounded-md border p-2 text-left ${dashboardTheme.portalBgColor === preset.bgColor ? "border-gold ring-1 ring-gold" : "border-border"}`}
                        >
                          <span className="inline-block h-4 w-4 rounded-full border border-border mr-1 align-middle" style={{ backgroundColor: preset.bgColor }} />
                          <span className="text-xs">{preset.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("admin.dashboardThemePerArtistHint")}</p>
                )}
              </>
            ) : null}

            {step === "review" ? (
              <div className="space-y-3 text-sm">
                <p><span className="text-muted-foreground">{t("setup.shopName")}:</span> {form.shop_name}</p>
                <p><span className="text-muted-foreground">{t("setup.phone")}:</span> {form.phone || "—"}</p>
                <p><span className="text-muted-foreground">{t("setup.website")}:</span> {form.website_url || "—"}</p>
                <p><span className="text-muted-foreground">{t("setup.companyLegalName")}:</span> {form.company_legal_name}</p>
                <p>
                  <span className="text-muted-foreground">{t("setup.practitionerReview")}:</span>{" "}
                  {ownerIsPractitioner === true
                    ? t("setup.practitionerYesShort")
                    : ownerIsPractitioner === false
                      ? t("setup.practitionerNoShort")
                      : "—"}
                </p>
                <p><span className="text-muted-foreground">{t("admin.scheduleOpenTime")}:</span> {scheduleHours.openTime} – {scheduleHours.closeTime}</p>
                {isNativeApp() && nativePlatform() === "ios" && !isIpadDevice() ? (
                  <div className="rounded-lg border border-gold/40 bg-gold/5 p-3 space-y-2">
                    <p className="text-xs text-muted-foreground">{t("pos.setupEnableTapToPayReviewHint")}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => navigate("/checkout?enableTapToPay=1")}
                    >
                      <TapToPayWaveIcon className="h-4 w-4 mr-2" />
                      {t("pos.setupEnableTapToPayCta")}
                    </Button>
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground pt-2">{t("setup.reviewHint")}</p>
              </div>
            ) : null}

            <div className="flex justify-between gap-2 pt-4 border-t border-border">
              <Button type="button" variant="outline" onClick={goBack} disabled={stepIndex === 0 || saving}>
                {t("setup.back")}
              </Button>
              {step === "review" ? (
                <Button type="button" variant="gold" onClick={() => void finishSetup()} disabled={saving}>
                  {saving ? t("setup.finishing") : t("setup.finish")}
                </Button>
              ) : (
                <Button type="button" variant="gold" onClick={() => void goNext()} disabled={saving}>
                  {saving ? t("settings.saving") : t("setup.continue")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    </MarketingLayout>
  );
};

export default ShopSetupWizardPage;

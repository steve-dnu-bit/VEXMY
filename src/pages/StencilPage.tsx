import { useEffect, useRef, useState, useMemo } from "react";
import { Upload, Loader2, Download, ChevronDown, Maximize2, FolderClock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { getStencilMaxForPlan } from "@/lib/pricingPlans";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/components/AppLayout";
import { StencilCompare } from "@/components/stencil/StencilCompare";
import { generateAiStencil, STENCIL_STYLES, DEFAULT_STENCIL_STYLE, StencilQuotaError, type StencilStyle } from "@/lib/aiStencil";
import { STENCIL_STYLE_EXAMPLES } from "@/lib/stencilStyleExamples";
import {
  DEFAULT_STENCIL_SETTINGS,
  generateLocalStencil,
  type LocalStencilSettings,
} from "@/lib/stencilLocal";
import {
  deleteStencilSession,
  downloadStencilOnly,
  fetchRecentStencils,
  persistStencilSession,
  type RecentStencil,
  type StencilSession,
} from "@/lib/stencilStorage";
import { fetchStencilQuota, type StencilQuota } from "@/lib/stencilQuota";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";

const StencilPage = () => {
  const { user } = useAuth();
  const { featureNumber, data: subscriptionData } = useSubscription();
  const planStencilLimit = useMemo(() => {
    const fromFeatures = featureNumber("stencil_max_per_24h");
    if (fromFeatures > 0) return fromFeatures;
    return getStencilMaxForPlan(subscriptionData?.subscription?.planId ?? subscriptionData?.plan?.id ?? null);
  }, [featureNumber, subscriptionData?.subscription?.planId, subscriptionData?.plan?.id]);
  const { toast } = useToast();
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [stencilUrl, setStencilUrl] = useState<string | null>(null);
  const [session, setSession] = useState<StencilSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [mode, setMode] = useState<"ai" | "local">("ai");
  const [style, setStyle] = useState<StencilStyle>(DEFAULT_STENCIL_STYLE);
  const [quota, setQuota] = useState<StencilQuota | null>(null);
  const [settings, setSettings] = useState<LocalStencilSettings>(DEFAULT_STENCIL_SETTINGS);
  const [enlargedStyle, setEnlargedStyle] = useState<(typeof STENCIL_STYLES)[number] | null>(null);
  const [recent, setRecent] = useState<RecentStencil[]>([]);
  const [recentOpen, setRecentOpen] = useState(false);
  const [viewing, setViewing] = useState<RecentStencil | null>(null);
  const sessionRef = useRef<StencilSession | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const refreshRecent = async () => {
    if (!user) return;
    try {
      setRecent(await fetchRecentStencils(user.id));
    } catch {
      // Best-effort; the folder simply stays as-is if the fetch fails.
    }
  };

  useEffect(() => {
    refreshRecent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    fetchStencilQuota().then((q) => {
      if (active) setQuota(q);
    });
    return () => {
      active = false;
    };
  }, []);

  const removeStoredSession = async (existing: StencilSession | null) => {
    if (!existing) return;
    try {
      await deleteStencilSession(existing);
    } catch {
      // Best-effort cleanup when replacing or leaving the page.
    }
    if (sessionRef.current?.id === existing.id) {
      setSession(null);
      sessionRef.current = null;
    }
  };

  const set = <K extends keyof LocalStencilSettings>(key: K, value: LocalStencilSettings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    await removeStoredSession(sessionRef.current);
    setFile(selected);
    setStencilUrl(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(selected);
  };

  const handleGenerate = async () => {
    if (!file || !user) return;
    if (mode === "ai" && quota && quota.remaining <= 0) {
      toast({
        title: t("stencil.quotaReachedTitle"),
        description: t("stencil.quotaReachedDesc", { limit: quota.limit }),
        variant: "destructive",
      });
      return;
    }
    setLoading(true);

    try {
      await removeStoredSession(sessionRef.current);

      let generated: string;
      if (mode === "ai") {
        const result = await generateAiStencil(file, style);
        generated = result.stencilUrl;
        if (result.quota) {
          setQuota((prev) => ({
            used: result.quota?.used ?? prev?.used ?? 0,
            limit: result.quota?.limit ?? prev?.limit ?? 0,
            remaining: result.quota?.remaining ?? prev?.remaining ?? 0,
            resetsAt: prev?.resetsAt ?? null,
          }));
        }
      } else {
        generated = await generateLocalStencil(file, settings);
      }

      // Show the result immediately; cloud save is separate so a storage error
      // does not hide a successful local/AI render.
      setStencilUrl(generated);

      try {
        const stored = await persistStencilSession(user.id, file, generated);
        setSession(stored);
        sessionRef.current = stored;
        refreshRecent();
      } catch (persistError: unknown) {
        setSession(null);
        sessionRef.current = null;
        toast({
          title: t("stencil.generatedTitle"),
          description:
            persistError instanceof Error
              ? `${t("stencil.saveFailedDesc")} ${persistError.message}`
              : t("stencil.saveFailedDesc"),
          variant: "destructive",
        });
        return;
      }

      toast({
        title: t("stencil.generatedTitle"),
        description: t("stencil.generatedDesc"),
      });
    } catch (error: unknown) {
      if (error instanceof StencilQuotaError) {
        setQuota((prev) => ({
          used: error.quota?.used ?? prev?.used ?? 0,
          limit: error.quota?.limit ?? prev?.limit ?? 0,
          remaining: 0,
          resetsAt: prev?.resetsAt ?? null,
        }));
        toast({
          title: t("stencil.quotaReachedTitle"),
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: t("stencil.generationFailedTitle"),
          description: error instanceof Error ? error.message : t("stencil.genericFailure"),
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const resetDefaults = () => setSettings(DEFAULT_STENCIL_SETTINGS);

  const relativeTime = (iso: string) => {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 1) return t("stencil.justNow");
    if (mins < 60) return t("stencil.minutesAgo", { count: mins });
    const hrs = Math.floor(mins / 60);
    return t("stencil.hoursAgo", { count: hrs });
  };

  const handleDownloadUrl = async (url: string) => {
    try {
      await downloadStencilOnly(url);
      toast({
        title: t("stencil.downloadStartedTitle"),
        description: t("stencil.downloadStartedDesc"),
      });
    } catch (error: unknown) {
      toast({
        title: t("stencil.downloadFailedTitle"),
        description: error instanceof Error ? error.message : t("stencil.downloadFailedDesc"),
        variant: "destructive",
      });
    }
  };

  const handleDownload = async () => {
    if (!stencilUrl) return;
    setDownloading(true);
    try {
      await downloadStencilOnly(stencilUrl);
      toast({
        title: t("stencil.downloadStartedTitle"),
        description: t("stencil.downloadStartedDesc"),
      });
    } catch (error: unknown) {
      toast({
        title: t("stencil.downloadFailedTitle"),
        description: error instanceof Error ? error.message : t("stencil.downloadFailedDesc"),
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold">
            <span className="text-gold">{t("stencil.title")}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("stencil.subtitle")}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">
              {t("stencil.originalImage")}
            </h3>
            {preview ? (
              <div className="space-y-4">
                <img src={preview} alt={t("stencil.originalLabel")} loading="lazy" className="w-full rounded-lg object-cover aspect-square" />
                <label className="block">
                  <Button variant="ghost" size="sm" className="w-full" asChild>
                    <span>{t("stencil.changeImage")}</span>
                  </Button>
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                </label>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary p-12 transition-colors hover:border-primary/50 aspect-square">
                <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground text-center">
                  {t("stencil.dropOrUpload")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("stencil.fileHint")}</p>
                <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
              </label>
            )}

            {preview && (
              <div className="space-y-3 mt-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1.5">{t("stencil.engine")}</div>
                  <div className="grid grid-cols-2 gap-2 items-stretch">
                    <Button
                      type="button"
                      size="sm"
                      variant={mode === "ai" ? "gold" : "outline"}
                      className="h-auto min-h-9 w-full whitespace-normal py-1.5 text-center leading-tight"
                      onClick={() => setMode("ai")}
                    >
                      {t("stencil.engineAi")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={mode === "local" ? "gold" : "outline"}
                      className="h-auto min-h-9 w-full whitespace-normal py-1.5 text-center leading-tight"
                      onClick={() => setMode("local")}
                    >
                      {t("stencil.engineLocal")}
                    </Button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {mode === "ai"
                      ? t("stencil.engineAiHint", { limit: quota?.limit && quota.limit > 0 ? quota.limit : planStencilLimit })
                      : t("stencil.engineLocalHint")}
                  </p>
                </div>

                {mode === "ai" && quota && quota.limit > 0 && (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/60 px-3 py-2">
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {t("stencil.quotaCountdownTitle")}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{t("stencil.quotaResetNote", { limit: quota.limit })}</div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`font-display text-xl font-bold leading-none ${
                          quota.remaining > 0 ? "text-gold" : "text-destructive"
                        }`}
                      >
                        {quota.remaining}
                        <span className="text-sm font-normal text-muted-foreground">/{quota.limit}</span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {quota.remaining > 0
                          ? t("stencil.quotaCountdownValue", { remaining: quota.remaining, limit: quota.limit })
                          : t("stencil.quotaExhausted", { limit: quota.limit })}
                      </div>
                    </div>
                  </div>
                )}

                {mode === "ai" && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1.5">{t("stencil.styleLabel")}</div>
                    <div className="grid grid-cols-3 gap-2">
                      {STENCIL_STYLES.map((s) => {
                        const selected = style === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setStyle(s.id)}
                            aria-pressed={selected}
                            className={`group flex flex-col items-center gap-1.5 rounded-lg border p-2 text-center transition-colors ${
                              selected
                                ? "border-primary ring-1 ring-primary bg-primary/5"
                                : "border-border hover:border-primary/50"
                            }`}
                          >
                            <span className="relative block w-full aspect-square overflow-hidden rounded-md border border-border bg-white">
                              <img
                                src={STENCIL_STYLE_EXAMPLES[s.id]}
                                alt={t("stencil.styleExampleAlt", { style: t(s.nameKey) })}
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                              <span
                                role="button"
                                tabIndex={0}
                                aria-label={t("stencil.examplePreviewTitle", { style: t(s.nameKey) })}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEnlargedStyle(s);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setEnlargedStyle(s);
                                  }
                                }}
                                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md bg-background/80 text-foreground opacity-0 shadow-sm transition-opacity hover:bg-background group-hover:opacity-100 focus:opacity-100"
                              >
                                <Maximize2 className="h-3.5 w-3.5" />
                              </span>
                            </span>
                            <span className="block w-full truncate text-[11px] font-medium leading-tight">
                              {t(s.nameKey)}
                            </span>
                            <span className="block w-full truncate text-[10px] leading-tight text-muted-foreground">
                              {t(s.descKey)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">{t("stencil.stylePreviewHint")}</p>
                  </div>
                )}

                {mode === "local" && (
                  <>
                    <div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{t("stencil.lineDetail")}</span>
                        <span>{settings.detail}</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={settings.detail}
                        onChange={(e) => set("detail", Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{t("stencil.lineSensitivity")}</span>
                        <span>{settings.sensitivity}</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={90}
                        value={settings.sensitivity}
                        onChange={(e) => set("sensitivity", Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  </>
                )}

                <Button
                  variant="gold"
                  className="w-full gap-2"
                  onClick={handleGenerate}
                  disabled={loading || (mode === "ai" && !!quota && quota.remaining <= 0)}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> {t("stencil.generating")}
                    </>
                  ) : (
                    t("stencil.generateStencil")
                  )}
                </Button>

                {mode === "local" && (
                <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full gap-2 text-muted-foreground">
                      <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
                      {t("stencil.fineTune")}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-2">
                    <div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{t("stencil.smoothing")}</span>
                        <span>{settings.smoothing}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={4}
                        value={settings.smoothing}
                        onChange={(e) => set("smoothing", Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{t("stencil.contrast")}</span>
                        <span>{settings.contrast}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={40}
                        value={settings.contrast}
                        onChange={(e) => set("contrast", Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{t("stencil.toneSteps")}</span>
                        <span>{settings.posterize}</span>
                      </div>
                      <input
                        type="range"
                        min={3}
                        max={12}
                        value={settings.posterize}
                        onChange={(e) => set("posterize", Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{t("stencil.lineThickness")}</span>
                        <span>{settings.lineWidth}</span>
                      </div>
                      <input
                        type="range"
                        min={-2}
                        max={3}
                        value={settings.lineWidth}
                        onChange={(e) => set("lineWidth", Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{t("stencil.noiseCleanup")}</span>
                        <span>{settings.cleanup}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={4}
                        value={settings.cleanup}
                        onChange={(e) => set("cleanup", Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    <label className="flex items-center justify-between text-sm">
                      <span>{t("stencil.fillDarkAreas")}</span>
                      <input
                        type="checkbox"
                        checked={settings.fillShadows}
                        onChange={(e) => set("fillShadows", e.target.checked)}
                      />
                    </label>
                    {settings.fillShadows && (
                      <div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{t("stencil.shadowFill")}</span>
                          <span>{settings.shadowThreshold}</span>
                        </div>
                        <input
                          type="range"
                          min={25}
                          max={160}
                          value={settings.shadowThreshold}
                          onChange={(e) => set("shadowThreshold", Number(e.target.value))}
                          className="w-full"
                        />
                      </div>
                    )}
                    <label className="flex items-center justify-between text-sm">
                      <span>{t("stencil.invert")}</span>
                      <input
                        type="checkbox"
                        checked={settings.invert}
                        onChange={(e) => set("invert", e.target.checked)}
                      />
                    </label>
                    <Button variant="outline" size="sm" className="w-full" onClick={resetDefaults}>
                      {t("stencil.resetDefaults")}
                    </Button>
                  </CollapsibleContent>
                </Collapsible>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">
              {t("stencil.outputTitle")}
            </h3>
            {stencilUrl && preview ? (
              <div className="space-y-4">
                <StencilCompare beforeSrc={preview} afterSrc={stencilUrl} />
                <p className="text-xs text-center text-muted-foreground">
                  {t("stencil.dragCompare")}
                </p>
                <Button
                  variant="gold-outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={handleDownload}
                  disabled={downloading}
                >
                  {downloading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> {t("stencil.downloading")}
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" /> {t("stencil.downloadStencil")}
                    </>
                  )}
                </Button>
                <p className="text-[11px] text-center text-muted-foreground">
                  {t("stencil.retentionNotice")}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-secondary aspect-square">
                <p className="text-sm text-muted-foreground px-4 text-center">
                  {loading
                    ? mode === "ai"
                      ? t("stencil.renderingAi")
                      : t("stencil.extractingLines")
                    : t("stencil.uploadPromptOutput")}
                </p>
                {loading && <Loader2 className="mt-3 h-6 w-6 animate-spin text-primary" />}
              </div>
            )}
          </div>
        </div>

        <Collapsible open={recentOpen} onOpenChange={setRecentOpen} className="mt-6">
          <div className="rounded-xl border border-border bg-card">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 p-4 text-left"
              >
                <span className="flex items-center gap-2">
                  <FolderClock className="h-4 w-4 text-primary" />
                  <span className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                    {t("stencil.recentToggle", { count: recent.length })}
                  </span>
                </span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${recentOpen ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-4 pb-4">
              <p className="mb-3 text-[11px] text-muted-foreground">{t("stencil.recentSubtitle")}</p>
              {recent.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-secondary/50 px-3 py-6 text-center text-xs text-muted-foreground">
                  {t("stencil.recentEmpty")}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {recent.map((item) => (
                    <div key={item.id} className="overflow-hidden rounded-lg border border-border bg-card">
                      <button
                        type="button"
                        onClick={() => setViewing(item)}
                        className="block w-full aspect-square overflow-hidden bg-white"
                        aria-label={t("stencil.recentOpen")}
                      >
                        <img
                          src={item.stencilUrl}
                          alt={t("stencil.stencilLabel")}
                          loading="lazy"
                          className="h-full w-full object-contain transition-transform hover:scale-[1.03]"
                        />
                      </button>
                      <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                        <span className="text-[10px] text-muted-foreground">{relativeTime(item.createdAt)}</span>
                        <button
                          type="button"
                          onClick={() => handleDownloadUrl(item.stencilUrl)}
                          className="flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
                        >
                          <Download className="h-3 w-3" />
                          {t("stencil.recentDownload")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </div>
        </Collapsible>
      </div>

      <Dialog open={!!enlargedStyle} onOpenChange={(open) => !open && setEnlargedStyle(null)}>
        <DialogContent className="max-w-lg">
          {enlargedStyle && (
            <div className="space-y-3">
              <div>
                <h3 className="font-display text-lg font-semibold">
                  {t("stencil.examplePreviewTitle", { style: t(enlargedStyle.nameKey) })}
                </h3>
                <p className="text-xs text-muted-foreground">{t(enlargedStyle.descKey)}</p>
              </div>
              <img
                src={STENCIL_STYLE_EXAMPLES[enlargedStyle.id]}
                alt={t("stencil.styleExampleAlt", { style: t(enlargedStyle.nameKey) })}
                className="w-full rounded-lg border border-border"
              />
              <p className="text-[11px] text-muted-foreground">{t("stencil.examplePreviewHint")}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-lg">
          {viewing && (
            <div className="space-y-3">
              <StencilCompare beforeSrc={viewing.originalUrl} afterSrc={viewing.stencilUrl} />
              <p className="text-xs text-center text-muted-foreground">{t("stencil.dragCompare")}</p>
              <Button
                variant="gold-outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => handleDownloadUrl(viewing.stencilUrl)}
              >
                <Download className="h-4 w-4" /> {t("stencil.downloadStencil")}
              </Button>
              <p className="text-[11px] text-center text-muted-foreground">{t("stencil.retentionNotice")}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default StencilPage;

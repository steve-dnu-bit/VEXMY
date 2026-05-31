import { useEffect, useRef, useState } from "react";
import { Upload, Loader2, Download, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/components/AppLayout";
import { StencilCompare } from "@/components/stencil/StencilCompare";
import { StencilStylePreview } from "@/components/stencil/StencilStylePreview";
import { generateAiStencil, STENCIL_STYLES, DEFAULT_STENCIL_STYLE, StencilQuotaError, type StencilStyle } from "@/lib/aiStencil";
import {
  DEFAULT_STENCIL_SETTINGS,
  generateLocalStencil,
  type LocalStencilSettings,
} from "@/lib/stencilLocal";
import {
  deleteStencilSession,
  downloadStencilOnly,
  persistStencilSession,
  type StencilSession,
} from "@/lib/stencilStorage";
import { fetchStencilQuota, type StencilQuota } from "@/lib/stencilQuota";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTranslation } from "react-i18next";

const StencilPage = () => {
  const { user } = useAuth();
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
  const sessionRef = useRef<StencilSession | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

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
      const stored = await persistStencilSession(user.id, file, generated);
      setSession(stored);
      sessionRef.current = stored;
      setStencilUrl(generated);
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

  const handleDownload = async () => {
    if (!stencilUrl || !session) return;
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
            <span className="text-gradient-gold">{t("stencil.title")}</span>
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
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={mode === "ai" ? "gold" : "outline"}
                      className="w-full"
                      onClick={() => setMode("ai")}
                    >
                      {t("stencil.engineAi")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={mode === "local" ? "gold" : "outline"}
                      className="w-full"
                      onClick={() => setMode("local")}
                    >
                      {t("stencil.engineLocal")}
                    </Button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {mode === "ai" ? t("stencil.engineAiHint") : t("stencil.engineLocalHint")}
                  </p>
                </div>

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
                            <span className="block w-full aspect-square overflow-hidden rounded-md border border-border bg-white">
                              <StencilStylePreview styleId={s.id} />
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
                    {quota && quota.limit > 0 && (
                      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/60 px-3 py-2">
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            {t("stencil.quotaCountdownTitle")}
                          </div>
                          <div className="text-[11px] text-muted-foreground">{t("stencil.quotaResetNote")}</div>
                        </div>
                        <div className="text-right">
                          <div
                            className={`font-display text-xl font-bold leading-none ${
                              quota.remaining > 0 ? "text-gradient-gold" : "text-destructive"
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
                  disabled={downloading || !session}
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
      </div>
    </AppLayout>
  );
};

export default StencilPage;

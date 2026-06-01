import { useEffect, useRef, useState } from "react";
import { Upload, Loader2, Download, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/components/AppLayout";
import { StencilCompare } from "@/components/stencil/StencilCompare";
import { StencilStylePicker } from "@/components/stencil/StencilStylePicker";
import { StencilAiQuota } from "@/components/stencil/StencilAiQuota";
import {
  DEFAULT_STENCIL_SETTINGS,
  generateLocalStencil,
  type LocalStencilSettings,
} from "@/lib/stencilLocal";
import { fetchStencilAiRemaining, generateAiStencil } from "@/lib/stencilAi";
import {
  DEFAULT_STENCIL_PRESET_ID,
  STENCIL_PRESETS,
  type StencilPreset,
} from "@/lib/stencilPresets";
import {
  deleteStencilSession,
  downloadStencilAndDelete,
  persistStencilSession,
  type StencilSession,
} from "@/lib/stencilStorage";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTranslation } from "react-i18next";

function SliderControl({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 leading-snug">{label}</span>
        <span className="shrink-0 tabular-nums">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

const StencilPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [stencilUrl, setStencilUrl] = useState<string | null>(null);
  const [session, setSession] = useState<StencilSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRemaining, setAiRemaining] = useState<number | null>(null);
  const [aiQuotaLoading, setAiQuotaLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState(DEFAULT_STENCIL_PRESET_ID);
  const [settings, setSettings] = useState<LocalStencilSettings>(() => {
    const preset = STENCIL_PRESETS.find((p) => p.id === DEFAULT_STENCIL_PRESET_ID);
    return preset ? { ...preset.settings } : DEFAULT_STENCIL_SETTINGS;
  });
  const sessionRef = useRef<StencilSession | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!user) {
      setAiRemaining(null);
      setAiQuotaLoading(false);
      return;
    }

    let cancelled = false;
    setAiQuotaLoading(true);
    void fetchStencilAiRemaining()
      .then((remaining) => {
        if (!cancelled) setAiRemaining(remaining);
      })
      .catch(() => {
        if (!cancelled) setAiRemaining(null);
      })
      .finally(() => {
        if (!cancelled) setAiQuotaLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const clearStencilState = () => {
    setPreview(null);
    setFile(null);
    setStencilUrl(null);
    setSession(null);
    sessionRef.current = null;
  };

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
    setLoading(true);

    try {
      await removeStoredSession(sessionRef.current);

      const generated = await generateLocalStencil(file, settings);
      const stored = await persistStencilSession(user.id, file, generated);
      setSession(stored);
      sessionRef.current = stored;
      setStencilUrl(generated);
      toast({
        title: t("stencil.generatedTitle"),
        description: t("stencil.generatedDesc"),
      });
    } catch (error: unknown) {
      toast({
        title: t("stencil.generationFailedTitle"),
        description: error instanceof Error ? error.message : t("stencil.genericFailure"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAi = async () => {
    if (!file || !user || !preview) return;
    if (aiRemaining !== null && aiRemaining <= 0) {
      toast({
        title: t("stencil.aiQuotaDepletedTitle"),
        description: t("stencil.aiQuotaDepleted"),
        variant: "destructive",
      });
      return;
    }

    setAiLoading(true);

    try {
      await removeStoredSession(sessionRef.current);

      const { stencilDataUrl, aiRemaining: nextRemaining } = await generateAiStencil(preview);
      const stored = await persistStencilSession(user.id, file, stencilDataUrl);
      setSession(stored);
      sessionRef.current = stored;
      setStencilUrl(stencilDataUrl);
      setAiRemaining(nextRemaining);
      toast({
        title: t("stencil.aiGeneratedTitle"),
        description: t("stencil.aiGeneratedDesc", { count: nextRemaining }),
      });
    } catch (error: unknown) {
      const quotaErr = error as Error & { aiRemaining?: number };
      if (typeof quotaErr.aiRemaining === "number") {
        setAiRemaining(quotaErr.aiRemaining);
      }
      toast({
        title: t("stencil.generationFailedTitle"),
        description: error instanceof Error ? error.message : t("stencil.genericFailure"),
        variant: "destructive",
      });
    } finally {
      setAiLoading(false);
    }
  };

  const resetDefaults = () => {
    setSelectedPresetId(DEFAULT_STENCIL_PRESET_ID);
    const preset = STENCIL_PRESETS.find((p) => p.id === DEFAULT_STENCIL_PRESET_ID);
    setSettings(preset ? { ...preset.settings } : DEFAULT_STENCIL_SETTINGS);
  };

  const handlePresetSelect = (preset: StencilPreset) => {
    setSelectedPresetId(preset.id);
    setSettings({ ...preset.settings });
  };

  const handleDownload = async () => {
    if (!stencilUrl || !session) return;
    setDownloading(true);
    try {
      await downloadStencilAndDelete(session, stencilUrl);
      clearStencilState();
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
      <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
        <header className="space-y-3">
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-bold">
              <span className="text-gradient-gold">{t("stencil.title")}</span>
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground text-balance">
              {t("stencil.subtitle")}
            </p>
          </div>
          <StencilAiQuota remaining={aiRemaining} loading={aiQuotaLoading} className="max-w-md" />
        </header>

        <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <StencilStylePicker selectedId={selectedPresetId} onSelect={handlePresetSelect} />
        </section>

        <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:gap-6">
          <section className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="mb-3 font-display text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {t("stencil.originalImage")}
            </h2>
            {preview ? (
              <div className="space-y-3">
                <img
                  src={preview}
                  alt={t("stencil.originalLabel")}
                  loading="lazy"
                  className="aspect-square w-full rounded-lg object-cover"
                />
                <label className="block">
                  <Button variant="outline" size="sm" className="h-auto min-h-9 w-full whitespace-normal px-3 py-2" asChild>
                    <span>{t("stencil.changeImage")}</span>
                  </Button>
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                </label>
              </div>
            ) : (
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary p-6 transition-colors hover:border-primary/50 sm:p-10">
                <Upload className="mb-3 h-10 w-10 shrink-0 text-muted-foreground" />
                <p className="max-w-[16rem] text-center text-sm leading-snug text-muted-foreground">
                  {t("stencil.dropOrUpload")}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{t("stencil.fileHint")}</p>
                <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
              </label>
            )}
          </section>

          <section className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="mb-3 font-display text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {t("stencil.outputTitle")}
            </h2>
            {stencilUrl && preview ? (
              <div className="space-y-3">
                <StencilCompare beforeSrc={preview} afterSrc={stencilUrl} />
                <p className="text-center text-xs leading-relaxed text-muted-foreground">
                  {t("stencil.dragCompare")}
                </p>
              </div>
            ) : (
              <div className="flex aspect-square flex-col items-center justify-center rounded-lg border border-border bg-secondary px-4">
                <p className="max-w-[18rem] text-center text-sm leading-relaxed text-muted-foreground">
                  {loading || aiLoading
                    ? t("stencil.extractingLines")
                    : t("stencil.uploadPromptOutput")}
                </p>
                {(loading || aiLoading) && <Loader2 className="mt-3 h-6 w-6 animate-spin text-primary" />}
              </div>
            )}
          </section>
        </div>

        {preview && (
          <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <SliderControl
                label={t("stencil.lineDetail")}
                value={settings.detail}
                min={1}
                max={10}
                onChange={(value) => set("detail", value)}
              />
              <SliderControl
                label={t("stencil.lineSensitivity")}
                value={settings.sensitivity}
                min={10}
                max={90}
                onChange={(value) => set("sensitivity", value)}
              />
            </div>

            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 h-auto min-h-9 w-full justify-center gap-2 whitespace-normal px-3 py-2 text-muted-foreground sm:w-auto sm:justify-start"
                >
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
                  {t("stencil.fineTune")}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-3">
                <div className="grid gap-4 sm:grid-cols-2">
                  <SliderControl
                    label={t("stencil.smoothing")}
                    value={settings.smoothing}
                    min={0}
                    max={4}
                    onChange={(value) => set("smoothing", value)}
                  />
                  <SliderControl
                    label={t("stencil.contrast")}
                    value={settings.contrast}
                    min={0}
                    max={40}
                    onChange={(value) => set("contrast", value)}
                  />
                  <SliderControl
                    label={t("stencil.toneSteps")}
                    value={settings.posterize}
                    min={3}
                    max={12}
                    onChange={(value) => set("posterize", value)}
                  />
                  <SliderControl
                    label={t("stencil.lineThickness")}
                    value={settings.lineWidth}
                    min={-2}
                    max={3}
                    onChange={(value) => set("lineWidth", value)}
                  />
                  <SliderControl
                    label={t("stencil.noiseCleanup")}
                    value={settings.cleanup}
                    min={0}
                    max={4}
                    onChange={(value) => set("cleanup", value)}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex min-h-10 items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                    <span className="min-w-0 leading-snug">{t("stencil.fillDarkAreas")}</span>
                    <input
                      type="checkbox"
                      className="shrink-0"
                      checked={settings.fillShadows}
                      onChange={(e) => set("fillShadows", e.target.checked)}
                    />
                  </label>
                  <label className="flex min-h-10 items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                    <span className="min-w-0 leading-snug">{t("stencil.invert")}</span>
                    <input
                      type="checkbox"
                      className="shrink-0"
                      checked={settings.invert}
                      onChange={(e) => set("invert", e.target.checked)}
                    />
                  </label>
                </div>

                {settings.fillShadows && (
                  <SliderControl
                    label={t("stencil.shadowFill")}
                    value={settings.shadowThreshold}
                    min={25}
                    max={160}
                    onChange={(value) => set("shadowThreshold", value)}
                  />
                )}

                <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={resetDefaults}>
                  {t("stencil.resetDefaults")}
                </Button>
              </CollapsibleContent>
            </Collapsible>

            <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap lg:max-w-xl">
                <Button
                  variant="gold"
                  className="h-auto min-h-10 w-full whitespace-normal px-4 py-2.5 sm:flex-1"
                  onClick={handleGenerate}
                  disabled={loading || aiLoading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      <span>{t("stencil.generating")}</span>
                    </>
                  ) : (
                    t("stencil.generateStencil")
                  )}
                </Button>

                <Button
                  variant="gold-outline"
                  className="h-auto min-h-10 w-full whitespace-normal px-4 py-2.5 sm:flex-1"
                  onClick={handleGenerateAi}
                  disabled={aiLoading || loading || aiQuotaLoading || aiRemaining === 0}
                >
                  {aiLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      <span>{t("stencil.aiGenerating")}</span>
                    </>
                  ) : (
                    t("stencil.generateAiStencil", {
                      count: aiRemaining ?? "…",
                    })
                  )}
                </Button>
              </div>

              {stencilUrl && session && (
                <div className="flex w-full min-w-0 flex-col gap-2 sm:max-w-xs sm:flex-1">
                  <Button
                    variant="gold-outline"
                    className="h-auto min-h-10 w-full whitespace-normal px-4 py-2.5"
                    onClick={handleDownload}
                    disabled={downloading}
                  >
                    {downloading ? (
                      <>
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                        <span>{t("stencil.downloading")}</span>
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 shrink-0" />
                        <span>{t("stencil.downloadStencil")}</span>
                      </>
                    )}
                  </Button>
                  <p className="text-center text-[11px] leading-relaxed text-muted-foreground sm:text-left">
                    {t("stencil.downloadRemovesFiles")}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </AppLayout>
  );
};

export default StencilPage;

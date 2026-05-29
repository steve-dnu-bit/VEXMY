import { useEffect, useRef, useState } from "react";
import { Upload, Loader2, Download, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/components/AppLayout";
import { StencilCompare } from "@/components/stencil/StencilCompare";
import {
  DEFAULT_STENCIL_SETTINGS,
  generateLocalStencil,
  type LocalStencilSettings,
} from "@/lib/stencilLocal";
import {
  deleteStencilSession,
  downloadStencilAndDelete,
  persistStencilSession,
  type StencilSession,
} from "@/lib/stencilStorage";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const StencilPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [stencilUrl, setStencilUrl] = useState<string | null>(null);
  const [session, setSession] = useState<StencilSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [settings, setSettings] = useState<LocalStencilSettings>(DEFAULT_STENCIL_SETTINGS);
  const sessionRef = useRef<StencilSession | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

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
        title: "Stencil generated",
        description: "Drag the slider to compare. Files are removed from the server after you download.",
      });
    } catch (error: unknown) {
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetDefaults = () => setSettings(DEFAULT_STENCIL_SETTINGS);

  const handleDownload = async () => {
    if (!stencilUrl || !session) return;
    setDownloading(true);
    try {
      await downloadStencilAndDelete(session, stencilUrl);
      clearStencilState();
      toast({
        title: "Download started",
        description: "Original and stencil have been removed from storage.",
      });
    } catch (error: unknown) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Could not complete download",
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
            <span className="text-gradient-gold">Stencil Generator</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Upload a reference and generate a black line-art stencil in your browser — no external API.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">
              Original Image
            </h3>
            {preview ? (
              <div className="space-y-4">
                <img src={preview} alt="Original" loading="lazy" className="w-full rounded-lg object-cover aspect-square" />
                <label className="block">
                  <Button variant="ghost" size="sm" className="w-full" asChild>
                    <span>Change Image</span>
                  </Button>
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                </label>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary p-12 transition-colors hover:border-primary/50 aspect-square">
                <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground text-center">
                  Drop an image here or click to upload
                </p>
                <p className="mt-1 text-xs text-muted-foreground">PNG, JPG up to 10MB</p>
                <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
              </label>
            )}

            {preview && (
              <div className="space-y-3 mt-4">
                <div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Line detail</span>
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
                    <span>Line sensitivity</span>
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

                <Button variant="gold" className="w-full gap-2" onClick={handleGenerate} disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Generating...
                    </>
                  ) : (
                    "Generate stencil"
                  )}
                </Button>

                <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full gap-2 text-muted-foreground">
                      <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
                      Fine tune
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-2">
                    <div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Smoothing</span>
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
                        <span>Contrast</span>
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
                        <span>Tone steps</span>
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
                        <span>Line thickness</span>
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
                        <span>Noise cleanup</span>
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
                      <span>Fill dark areas</span>
                      <input
                        type="checkbox"
                        checked={settings.fillShadows}
                        onChange={(e) => set("fillShadows", e.target.checked)}
                      />
                    </label>
                    {settings.fillShadows && (
                      <div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Shadow fill</span>
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
                      <span>Invert</span>
                      <input
                        type="checkbox"
                        checked={settings.invert}
                        onChange={(e) => set("invert", e.target.checked)}
                      />
                    </label>
                    <Button variant="outline" size="sm" className="w-full" onClick={resetDefaults}>
                      Reset to defaults
                    </Button>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">
              Stencil Output
            </h3>
            {stencilUrl && preview ? (
              <div className="space-y-4">
                <StencilCompare beforeSrc={preview} afterSrc={stencilUrl} />
                <p className="text-xs text-center text-muted-foreground">
                  Drag the slider to compare original vs stencil
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
                      <Loader2 className="h-4 w-4 animate-spin" /> Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" /> Download Stencil
                    </>
                  )}
                </Button>
                <p className="text-[11px] text-center text-muted-foreground">
                  Download removes the original and stencil from cloud storage.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-secondary aspect-square">
                <p className="text-sm text-muted-foreground px-4 text-center">
                  {loading
                    ? "Extracting clean lines..."
                    : "Upload an image and generate — compare original vs stencil here"}
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

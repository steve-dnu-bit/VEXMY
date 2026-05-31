import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StencilCompare } from "@/components/stencil/StencilCompare";
import { cn } from "@/lib/utils";
import { createStencilDemoDataUrl } from "@/lib/stencilDemoImage";
import { generateLocalStencilFromDataUrl } from "@/lib/stencilLocal";
import { STENCIL_PRESETS, type StencilPreset } from "@/lib/stencilPresets";

type StencilStylePickerProps = {
  selectedId: string;
  onSelect: (preset: StencilPreset) => void;
};

export function StencilStylePicker({ selectedId, onSelect }: StencilStylePickerProps) {
  const { t } = useTranslation();
  const [demoSrc, setDemoSrc] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const selectedPreset = STENCIL_PRESETS.find((preset) => preset.id === selectedId) ?? STENCIL_PRESETS[0];

  useEffect(() => {
    let cancelled = false;

    async function buildPreviews() {
      setLoading(true);
      const source = createStencilDemoDataUrl(320);
      if (!cancelled) setDemoSrc(source);

      const next: Record<string, string> = {};
      for (const preset of STENCIL_PRESETS) {
        if (cancelled) return;
        try {
          next[preset.id] = await generateLocalStencilFromDataUrl(source, preset.settings);
        } catch {
          next[preset.id] = "";
        }
      }

      if (!cancelled) {
        setPreviews(next);
        setLoading(false);
      }
    }

    void buildPreviews();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelect = (preset: StencilPreset) => {
    onSelect(preset);
  };

  const selectedPreview = previews[selectedPreset.id];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {t("stencil.artistsTitle")}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {t("stencil.artistsHint")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {STENCIL_PRESETS.map((preset) => {
          const selected = preset.id === selectedId;
          const preview = previews[preset.id];

          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelect(preset)}
              className={cn(
                "flex min-w-0 flex-col overflow-hidden rounded-lg border bg-secondary/40 text-left transition-colors",
                selected
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border hover:border-primary/40 hover:bg-secondary/70",
              )}
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-white">
                {loading || !preview ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <img
                    src={preview}
                    alt={t(preset.nameKey)}
                    className="h-full w-full object-contain p-1"
                    draggable={false}
                  />
                )}
              </div>
              <div className="border-t border-border px-2 py-1.5">
                <p className={cn("truncate text-xs font-medium", selected && "text-primary")}>
                  {t(preset.nameKey)}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-secondary/30 p-3 sm:p-4">
        <div className="mb-3 space-y-1">
          <p className="font-display text-sm font-semibold text-foreground">{t(selectedPreset.nameKey)}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{t(selectedPreset.descKey)}</p>
        </div>

        {loading || !demoSrc || !selectedPreview ? (
          <div className="flex aspect-square max-h-[min(70vw,28rem)] items-center justify-center rounded-lg border border-border bg-white">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : (
          <div className="mx-auto max-w-md space-y-2">
            <StencilCompare beforeSrc={demoSrc} afterSrc={selectedPreview} />
            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              {t("stencil.artistExampleHint", { artist: t(selectedPreset.nameKey) })}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

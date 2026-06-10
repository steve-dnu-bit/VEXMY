import { cn } from "@/lib/utils";

type LandingScreenshotFrameProps = {
  src: string;
  alt: string;
  title?: string;
  className?: string;
  priority?: boolean;
};

const LandingScreenshotFrame = ({
  src,
  alt,
  title = "velbok.com",
  className,
  priority = false,
}: LandingScreenshotFrameProps) => (
  <div
    className={cn(
      "overflow-hidden rounded-xl border border-border/60 bg-[#0c0d12] shadow-[0_24px_80px_rgba(0,0,0,0.45)]",
      className,
    )}
  >
    <div className="flex items-center gap-2 border-b border-border/50 bg-[#101216] px-4 py-2.5">
      <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
      <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
      <span className="ml-2 truncate text-[10px] text-muted-foreground sm:text-xs">{title}</span>
    </div>
    <div className="relative overflow-hidden bg-[#090a0f]">
      <img
        src={src}
        alt={alt}
        className="block w-full object-cover"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-black/5" />
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/5" />
    </div>
  </div>
);

export default LandingScreenshotFrame;

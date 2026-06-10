import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type LandingVideoFrameProps = {
  src: string;
  poster: string;
  alt: string;
  title?: string;
  className?: string;
  playing?: boolean;
  loop?: boolean;
  onEnded?: () => void;
  onTimeUpdate?: (progress: number) => void;
};

const LandingVideoFrame = ({
  src,
  poster,
  alt,
  title = "velbok.com",
  className,
  playing = true,
  loop = true,
  onEnded,
  onTimeUpdate,
}: LandingVideoFrameProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      void video.play().catch(() => {
        /* autoplay blocked until user interacts */
      });
    } else {
      video.pause();
    }
  }, [playing, src]);

  return (
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
        <video
          ref={videoRef}
          className="block w-full scale-[1.02] object-cover motion-reduce:scale-100"
          src={src}
          poster={poster}
          muted
          playsInline
          loop={loop}
          preload="metadata"
          aria-label={alt}
          onEnded={onEnded}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration > 0) onTimeUpdate?.(v.currentTime / v.duration);
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/10" />
        <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/5" />
      </div>
    </div>
  );
};

export default LandingVideoFrame;

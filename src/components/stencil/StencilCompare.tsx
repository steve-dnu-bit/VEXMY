import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type StencilCompareProps = {
  beforeSrc: string;
  afterSrc: string;
  className?: string;
};

export function StencilCompare({ beforeSrc, afterSrc, className }: StencilCompareProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const [dragging, setDragging] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const updatePosition = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.max(2, Math.min(98, pct)));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    containerRef.current?.setPointerCapture(e.pointerId);
    updatePosition(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    updatePosition(e.clientX);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    setDragging(false);
    containerRef.current?.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative aspect-square w-full overflow-hidden rounded-lg bg-white select-none touch-none",
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <img src={afterSrc} alt="Stencil" loading="lazy" className="absolute inset-0 h-full w-full object-contain" draggable={false} />

      <div
        className="absolute inset-y-0 left-0 overflow-hidden"
        style={{ width: `${position}%` }}
      >
        <img
          src={beforeSrc}
          alt="Original"
          loading="lazy"
          className="absolute inset-y-0 left-0 h-full max-w-none object-contain"
          style={{ width: containerWidth || "100%" }}
          draggable={false}
        />
      </div>

      <div
        className="absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-primary shadow-[0_0_8px_rgba(0,0,0,0.35)]"
        style={{ left: `${position}%` }}
      >
        <div
          className={cn(
            "absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-primary bg-background shadow-md transition-transform",
            dragging && "scale-110",
          )}
        >
          <ChevronLeft className="h-3.5 w-3.5 text-primary" />
          <ChevronRight className="h-3.5 w-3.5 text-primary -ml-1" />
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-background/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Original
      </div>
      <div
        className="pointer-events-none absolute bottom-2 rounded bg-background/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
        style={{ left: `calc(${position}% + 8px)` }}
      >
        Stencil
      </div>
    </div>
  );
}

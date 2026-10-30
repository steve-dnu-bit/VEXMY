import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { isNativeApp, nativePlatform } from "@/lib/platform";
import { loadTapToPaySfSymbolDataUrl } from "@/lib/terminal/tapToPayEducation";

type TapToPayWaveIconProps = {
  className?: string;
  /** Prefer filled for primary checkout CTA (Apple HIG wave.3.right.circle.fill). */
  filled?: boolean;
};

/**
 * Apple TTPOI 5.5 — on iOS uses the real SF Symbol wave.3.right.circle(.fill)
 * rendered by UIKit. Fallback SVG is only for web/Android (not entitlement UI).
 */
export function TapToPayWaveIcon({ className, filled = true }: TapToPayWaveIconProps) {
  const [src, setSrc] = useState<string | null>(null);
  const symbolName = filled ? "wave.3.right.circle.fill" : "wave.3.right.circle";

  useEffect(() => {
    if (!isNativeApp() || nativePlatform() !== "ios") return;
    let cancelled = false;
    void loadTapToPaySfSymbolDataUrl(symbolName).then((url) => {
      if (!cancelled && url) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [symbolName]);

  if (src) {
    // Quoted data-URL so WebKit does not drop the mask. flexShrink is inline because
    // the checkout button only forces shrink-0 on SVG children, and a nowrap label
    // in a longer locale was clipping this span off the button.
    const mask = `url("${src}")`;
    return (
      <span
        aria-hidden
        className={cn("inline-block shrink-0 align-middle", className)}
        style={{
          flexShrink: 0,
          backgroundColor: "currentColor",
          WebkitMaskImage: mask,
          maskImage: mask,
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
        }}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      style={{ flexShrink: 0 }}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8.2 12c1.1-1.35 2.2-2 3.3-2s2.2.65 3.3 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M6.6 12c1.55-2.05 3.2-3.05 4.9-3.05S14.85 9.95 16.4 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.75"
      />
      <path
        d="M5.2 12c1.95-2.7 4.05-4 6.3-4s4.35 1.3 6.3 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

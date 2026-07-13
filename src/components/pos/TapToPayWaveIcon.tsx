import { cn } from "@/lib/utils";

/** Approximates SF Symbol wave.3.right.circle for Apple TTPOI button iconography (req 5.5). */
export function TapToPayWaveIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
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

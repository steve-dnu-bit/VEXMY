import { useId } from "react";
import { cn } from "@/lib/utils";

// A small rose motif drawn as an SVG, rendered in the visual language of each
// AI stencil style. It gives artists a concrete example of how a style's lines
// will look before they spend a generation. The same motif is reused across all
// styles so the difference between them is easy to compare at a glance.

const BLOOM =
  "M32 9 C 25 8 20 14 24 20 C 16 18 11 26 18 31 C 12 37 18 46 26 42 C 27 49 37 49 39 42 C 47 46 52 38 46 32 C 53 28 50 19 42 21 C 45 13 39 8 32 9 Z";
const SWIRL =
  "M31 18 C 24 18 21 25 26 30 C 30 34 38 31 37 25 C 36 21 31 20 29 24 C 28 27 31 29 33 27";
const STEM = "M32 46 C 32 52 32 56 32 60";
const LEAF_L = "M32 52 C 26 49 19 51 18 51 C 21 57 28 58 32 53 Z";
const LEAF_R = "M32 49 C 38 46 45 48 46 48 C 43 54 36 55 32 50 Z";

const INK = "#111111";

type Props = {
  styleId: string;
  className?: string;
};

export function StencilStylePreview({ styleId, className }: Props) {
  const dotsId = useId();

  const body = (() => {
    switch (styleId) {
      // Sailor Jerry — bold traditional: thick, uniform outlines.
      case "bold":
        return (
          <g fill="none" stroke={INK} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
            <path d={BLOOM} />
            <path d={SWIRL} strokeWidth={2.8} />
            <path d={STEM} />
            <path d={LEAF_L} />
            <path d={LEAF_R} />
          </g>
        );

      // Dr. Woo — fine line / single needle: thin, delicate, uniform lines.
      case "fineline":
        return (
          <g fill="none" stroke={INK} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round">
            <path d={BLOOM} />
            <path d={SWIRL} />
            <path d={STEM} />
            <path d={LEAF_L} />
            <path d={LEAF_R} />
          </g>
        );

      // Inez Janiak — sketch: expressive linework with a faint doubled contour.
      case "sketch":
        return (
          <>
            <g fill="none" stroke={INK} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
              <path d={BLOOM} />
              <path d={SWIRL} />
              <path d={STEM} />
              <path d={LEAF_L} />
              <path d={LEAF_R} />
            </g>
            <g
              fill="none"
              stroke={INK}
              strokeWidth={0.9}
              strokeLinecap="round"
              opacity={0.45}
              transform="translate(1.1 -0.9) rotate(1.2 32 32)"
            >
              <path d={BLOOM} />
              <path d={SWIRL} />
              <path d={LEAF_L} />
              <path d={LEAF_R} />
            </g>
          </>
        );

      // Chaim Machlev — dotwork: outlines with stippled fill in the bloom.
      case "dotwork":
        return (
          <>
            <defs>
              <pattern id={dotsId} width={3.4} height={3.4} patternUnits="userSpaceOnUse">
                <circle cx={1} cy={1} r={0.8} fill={INK} />
              </pattern>
            </defs>
            <path d={BLOOM} fill={`url(#${dotsId})`} stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
            <g fill="none" stroke={INK} strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round">
              <path d={SWIRL} />
              <path d={STEM} />
              <path d={LEAF_L} />
              <path d={LEAF_R} />
            </g>
          </>
        );

      // Thomas Hooper — blackwork: solid black masses with negative-space lines.
      case "blackwork":
        return (
          <>
            <path d={BLOOM} fill={INK} stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
            <path d={SWIRL} fill="none" stroke="#ffffff" strokeWidth={1.7} strokeLinecap="round" />
            <path d={LEAF_L} fill={INK} stroke={INK} strokeWidth={1} strokeLinejoin="round" />
            <path d={LEAF_R} fill={INK} stroke={INK} strokeWidth={1} strokeLinejoin="round" />
            <path d={STEM} fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
          </>
        );

      // Stefan Dinu — signature line (default): clean contours with varied weight.
      default:
        return (
          <g fill="none" stroke={INK} strokeLinecap="round" strokeLinejoin="round">
            <path d={BLOOM} strokeWidth={2.4} />
            <path d={SWIRL} strokeWidth={1.3} />
            <path d={STEM} strokeWidth={2.2} />
            <path d={LEAF_L} strokeWidth={1.6} />
            <path d={LEAF_R} strokeWidth={1.6} />
          </g>
        );
    }
  })();

  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-hidden="true"
      className={cn("h-full w-full", className)}
    >
      <rect width={64} height={64} rx={8} fill="#ffffff" />
      {body}
    </svg>
  );
}

export default StencilStylePreview;

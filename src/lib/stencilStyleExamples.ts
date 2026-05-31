import paris from "@/assets/stencil-styles/paris.png";
import london from "@/assets/stencil-styles/london.png";
import tokyo from "@/assets/stencil-styles/tokyo.png";
import rome from "@/assets/stencil-styles/rome.png";
import berlin from "@/assets/stencil-styles/berlin.png";
import madrid from "@/assets/stencil-styles/madrid.png";

// Example before/after renders shown on each style card so artists can see how a
// style's lines look before spending a generation. Keyed by the style `id` from
// STENCIL_STYLES (see src/lib/aiStencil.ts).
export const STENCIL_STYLE_EXAMPLES: Record<string, string> = {
  valoonia: paris,
  bold: london,
  fineline: tokyo,
  sketch: rome,
  dotwork: berlin,
  blackwork: madrid,
};

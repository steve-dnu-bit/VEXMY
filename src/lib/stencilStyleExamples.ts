const stencilStyleBase = `${import.meta.env.BASE_URL}stencil-styles`;

/** Public asset URLs — loaded on demand by the browser, not bundled in JS. */
export const STENCIL_STYLE_EXAMPLES: Record<string, string> = {
  valoonia: `${stencilStyleBase}/paris.png`,
  bold: `${stencilStyleBase}/london.png`,
  fineline: `${stencilStyleBase}/tokyo.png`,
  sketch: `${stencilStyleBase}/rome.png`,
  dotwork: `${stencilStyleBase}/berlin.png`,
  blackwork: `${stencilStyleBase}/madrid.png`,
};

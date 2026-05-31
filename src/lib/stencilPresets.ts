import { DEFAULT_STENCIL_SETTINGS, type LocalStencilSettings } from "@/lib/stencilLocal";

export type StencilPreset = {
  id: string;
  nameKey: string;
  descKey: string;
  settings: LocalStencilSettings;
};

/** Stencil output tuned to each artist's typical linework preferences. */
export const STENCIL_PRESETS: StencilPreset[] = [
  {
    id: "stefan-dinu",
    nameKey: "stencil.artists.stefanDinu.name",
    descKey: "stencil.artists.stefanDinu.desc",
    settings: {
      detail: 3,
      sensitivity: 38,
      smoothing: 2,
      lineWidth: 2,
      cleanup: 3,
      posterize: 5,
      contrast: 22,
      fillShadows: false,
      shadowThreshold: 88,
      invert: false,
    },
  },
  {
    id: "alex-morgan",
    nameKey: "stencil.artists.alexMorgan.name",
    descKey: "stencil.artists.alexMorgan.desc",
    settings: { ...DEFAULT_STENCIL_SETTINGS },
  },
  {
    id: "jordan-lee",
    nameKey: "stencil.artists.jordanLee.name",
    descKey: "stencil.artists.jordanLee.desc",
    settings: {
      detail: 9,
      sensitivity: 72,
      smoothing: 0,
      lineWidth: 0,
      cleanup: 1,
      posterize: 8,
      contrast: 12,
      fillShadows: false,
      shadowThreshold: 88,
      invert: false,
    },
  },
  {
    id: "elena-varga",
    nameKey: "stencil.artists.elenaVarga.name",
    descKey: "stencil.artists.elenaVarga.desc",
    settings: {
      detail: 2,
      sensitivity: 28,
      smoothing: 2,
      lineWidth: 1,
      cleanup: 4,
      posterize: 4,
      contrast: 18,
      fillShadows: false,
      shadowThreshold: 88,
      invert: false,
    },
  },
  {
    id: "tom-andersson",
    nameKey: "stencil.artists.tomAndersson.name",
    descKey: "stencil.artists.tomAndersson.desc",
    settings: {
      detail: 5,
      sensitivity: 48,
      smoothing: 1,
      lineWidth: 1,
      cleanup: 2,
      posterize: 6,
      contrast: 16,
      fillShadows: true,
      shadowThreshold: 95,
      invert: false,
    },
  },
  {
    id: "yuki-tanaka",
    nameKey: "stencil.artists.yukiTanaka.name",
    descKey: "stencil.artists.yukiTanaka.desc",
    settings: {
      detail: 8,
      sensitivity: 65,
      smoothing: 0,
      lineWidth: -1,
      cleanup: 0,
      posterize: 10,
      contrast: 10,
      fillShadows: false,
      shadowThreshold: 88,
      invert: false,
    },
  },
];

export const DEFAULT_STENCIL_PRESET_ID = "stefan-dinu";

export function getStencilPreset(id: string): StencilPreset | undefined {
  return STENCIL_PRESETS.find((preset) => preset.id === id);
}

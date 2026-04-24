/**
 * Stable Diffusion model configuration, parameter definitions, and helpers.
 *
 * Extracted from components/sd/sd-panel.tsx so that store/sd.ts can use
 * these without a reverse dependency on the component layer.
 *
 * IMPORTANT: `Locale` references are wrapped in getter functions so they are
 * NOT evaluated at module-load time.  During Next.js SSR / static prerender
 * the browser-only locale initialisation hasn't run yet, which would crash
 * with "Cannot read properties of undefined (reading 'EN')".
 */

import Locale from "@/app/locales";

// ----- types ---------------------------------------------------------------

export interface SdParamOption {
  name: string;
  value: string;
}

export interface SdParamConfig {
  name: string;
  value: string;
  type: string;
  placeholder?: string;
  required?: boolean;
  rows?: number;
  sub?: string;
  options?: SdParamOption[];
  min?: number;
  max?: number;
  default?: string | number;
  support?: string[];
}

export type SdFormData = Record<string, string | number>;

export interface SdModelConfig {
  name: string;
  value: string;
  params: (data: SdFormData) => SdParamConfig[];
}

// ----- param definitions (lazy — Locale is only read at call time) ---------

export function getParamDefinitions(): SdParamConfig[] {
  return [
    {
      name: Locale.SdPanel.Prompt,
      value: "prompt",
      type: "textarea",
      placeholder: Locale.SdPanel.PleaseInput(Locale.SdPanel.Prompt),
      required: true,
    },
    {
      name: Locale.SdPanel.ModelVersion,
      value: "model",
      type: "select",
      default: "sd3-medium",
      support: ["sd3"],
      options: [
        { name: "SD3 Medium", value: "sd3-medium" },
        { name: "SD3 Large", value: "sd3-large" },
        { name: "SD3 Large Turbo", value: "sd3-large-turbo" },
      ],
    },
    {
      name: Locale.SdPanel.NegativePrompt,
      value: "negative_prompt",
      type: "textarea",
      placeholder: Locale.SdPanel.PleaseInput(Locale.SdPanel.NegativePrompt),
    },
    {
      name: Locale.SdPanel.AspectRatio,
      value: "aspect_ratio",
      type: "select",
      default: "1:1",
      options: [
        { name: "1:1", value: "1:1" },
        { name: "16:9", value: "16:9" },
        { name: "21:9", value: "21:9" },
        { name: "2:3", value: "2:3" },
        { name: "3:2", value: "3:2" },
        { name: "4:5", value: "4:5" },
        { name: "5:4", value: "5:4" },
        { name: "9:16", value: "9:16" },
        { name: "9:21", value: "9:21" },
      ],
    },
    {
      name: Locale.SdPanel.ImageStyle,
      value: "style",
      type: "select",
      default: "3d-model",
      support: ["core"],
      options: [
        { name: Locale.SdPanel.Styles.D3Model, value: "3d-model" },
        { name: Locale.SdPanel.Styles.AnalogFilm, value: "analog-film" },
        { name: Locale.SdPanel.Styles.Anime, value: "anime" },
        { name: Locale.SdPanel.Styles.Cinematic, value: "cinematic" },
        { name: Locale.SdPanel.Styles.ComicBook, value: "comic-book" },
        { name: Locale.SdPanel.Styles.DigitalArt, value: "digital-art" },
        { name: Locale.SdPanel.Styles.Enhance, value: "enhance" },
        { name: Locale.SdPanel.Styles.FantasyArt, value: "fantasy-art" },
        { name: Locale.SdPanel.Styles.Isometric, value: "isometric" },
        { name: Locale.SdPanel.Styles.LineArt, value: "line-art" },
        { name: Locale.SdPanel.Styles.LowPoly, value: "low-poly" },
        {
          name: Locale.SdPanel.Styles.ModelingCompound,
          value: "modeling-compound",
        },
        { name: Locale.SdPanel.Styles.NeonPunk, value: "neon-punk" },
        { name: Locale.SdPanel.Styles.Origami, value: "origami" },
        { name: Locale.SdPanel.Styles.Photographic, value: "photographic" },
        { name: Locale.SdPanel.Styles.PixelArt, value: "pixel-art" },
        { name: Locale.SdPanel.Styles.TileTexture, value: "tile-texture" },
      ],
    },
    {
      name: "Seed",
      value: "seed",
      type: "number",
      default: 0,
      min: 0,
      max: 4294967294,
    },
    {
      name: Locale.SdPanel.OutFormat,
      value: "output_format",
      type: "select",
      default: "png",
      options: [
        { name: "PNG", value: "png" },
        { name: "JPEG", value: "jpeg" },
        { name: "WebP", value: "webp" },
      ],
    },
  ];
}

/** @deprecated Use `getParamDefinitions()` — kept as alias for backward compat */
export function params(): SdParamConfig[] {
  return getParamDefinitions();
}

// ----- helpers -------------------------------------------------------------

const sdCommonParams = (model: string, _data: SdFormData) => {
  return getParamDefinitions().filter((item) => {
    return !(item.support && !item.support.includes(model));
  });
};

// ----- models --------------------------------------------------------------

export const models: SdModelConfig[] = [
  {
    name: "Stable Image Ultra",
    value: "ultra",
    params: (data: SdFormData) => sdCommonParams("ultra", data),
  },
  {
    name: "Stable Image Core",
    value: "core",
    params: (data: SdFormData) => sdCommonParams("core", data),
  },
  {
    name: "Stable Diffusion 3",
    value: "sd3",
    params: (data: SdFormData) => {
      return sdCommonParams("sd3", data).filter((item) => {
        return !(
          data.model === "sd3-large-turbo" && item.value == "negative_prompt"
        );
      });
    },
  },
];

// ----- param data helpers --------------------------------------------------

export const getModelParamBasicData = (
  columns: SdParamConfig[],
  data: SdFormData,
  clearText?: boolean,
) => {
  const newParams: SdFormData = {};
  columns.forEach((item: SdParamConfig) => {
    if (clearText && ["text", "textarea", "number"].includes(item.type)) {
      newParams[item.value] = item.default || "";
    } else {
      newParams[item.value] =
        (data[item.value] as string | number) || item.default || "";
    }
  });
  return newParams;
};

export const getParams = (
  model: Pick<SdModelConfig, "value">,
  formData: SdFormData,
) => {
  return models.find((m) => m.value === model.value)?.params(formData) || [];
};

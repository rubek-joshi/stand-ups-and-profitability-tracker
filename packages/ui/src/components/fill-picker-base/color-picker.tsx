"use client";

// Base UI variant of the color picker.
//
// Reuses the engine + presentational parts from the original color-picker.
// Only the parts that benefit from Base UI primitives are rewritten:
//   - Hue, Lightness, Alpha → Slider
//   - FormatSwitcher        → Select
//   - ChannelInput          → NumberField (per channel)
//   - Swatches              → RadioGroup + Radio
//   - GamutBadge, ContrastReadout → own @base-ui/react/tooltip shells
//     (shared logic in color-picker/parts/*-shared)
//
// Everything else (Root/context, Area canvas, Chroma,
// Preview, EyeDropper, CssInput) is identical to the original; importing
// from the same source means engine fixes propagate to both variants for
// free.

import { Root } from "@workspace/ui/components/fill-picker/parts/root";
import { Area } from "@workspace/ui/components/fill-picker/parts/area";
import { Chroma } from "@workspace/ui/components/fill-picker/parts/chroma";
import { CssInput } from "@workspace/ui/components/fill-picker/parts/css-input";
import { Preview } from "@workspace/ui/components/fill-picker/parts/preview";
import { EyeDropper } from "@workspace/ui/components/fill-picker/parts/eye-dropper";

import { Hue } from "./parts/hue";
import { Lightness } from "./parts/lightness";
import { Alpha } from "./parts/alpha";
import { FormatSwitcher } from "./parts/format-switcher";
import { ChannelInput } from "./parts/channel-input";
import { Swatches } from "./parts/swatches";
import { GamutBadge } from "./parts/gamut-badge";
import { ContrastReadout } from "./parts/contrast-readout";

export type {
  ColorFormat,
  OklchColor,
  GamutInfo,
  ContrastResult,
  Gamut,
} from "@workspace/ui/components/fill-picker/lib/types";
export type {
  UseColorPickerProps,
  ColorPickerState,
} from "@workspace/ui/components/fill-picker/hooks/use-color-picker";
export { useColorPicker } from "@workspace/ui/components/fill-picker/hooks/use-color-picker";
export {
  parseColor,
  formatColor,
  formatAll,
  gamutInfo,
  toGamut,
  contrast,
  apcaContrast,
  isValidColor,
} from "@workspace/ui/components/fill-picker/lib/color";
export {
  colorChannels,
  setColorChannel,
} from "@workspace/ui/components/fill-picker/lib/channels";
export type { ChannelDescriptor } from "@workspace/ui/components/fill-picker/lib/channels";

export const ColorPickerBase = {
  Root,
  Area,
  Chroma,
  Hue,
  Lightness,
  Alpha,
  CssInput,
  FormatSwitcher,
  ChannelInput,
  Swatches,
  GamutBadge,
  ContrastReadout,
  Preview,
  EyeDropper,
};

// Alias so consuming code reads the same as the Radix variant — only the
// import path differs (`.../fill-picker-base/color-picker`).
export const ColorPicker = ColorPickerBase;

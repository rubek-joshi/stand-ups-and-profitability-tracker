import * as React from "react"
import {
  ChromePicker,
  hexToHsl,
  type BlossomColorPickerValue,
} from "@dayflow/blossom-color-picker-react"
import "@dayflow/blossom-color-picker/styles.css"
import { Label } from "@workspace/ui/components/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  ColorPicker,
  parseColor,
  type OklchColor,
} from "@workspace/ui/components/fill-picker-base/color-picker"
import { cn } from "@workspace/ui/lib/utils"
import { DEFAULT_PROJECT_THEME_COLOR } from "@/components/standup/entry-draft"
import { useAuth } from "@/lib/auth"
import { useTheme } from "@/lib/theme"

const SAVED_SWATCHES_KEY = "project-theme-color-swatches"

/**
 * Starters aligned with `packages/ui` tokens: neutrals, primary teal ramp
 * (chart-1…5), and stand-up task accents — same OKLCH values as globals.css.
 */
const SHADCN_SWATCH_STARTERS = [
  "oklch(0.985 0 0)",
  "oklch(0.552 0.016 285.938)",
  "oklch(0.141 0.005 285.823)",
  "oklch(0.845 0.143 164.978)",
  "oklch(0.696 0.17 162.48)",
  "oklch(0.596 0.145 163.225)",
  "oklch(0.508 0.118 165.612)",
  "oklch(0.432 0.095 166.913)",
  "oklch(0.55 0.14 250)",
  "oklch(0.55 0.14 145)",
  "oklch(0.55 0.2 25)",
  "oklch(0.577 0.245 27.325)",
  "oklch(0.55 0.16 290)",
  "oklch(0.65 0.15 70)",
] as const

function toOklch(color: string): OklchColor {
  return (
    parseColor(color.trim() || DEFAULT_PROJECT_THEME_COLOR) ??
    parseColor(DEFAULT_PROJECT_THEME_COLOR)!
  )
}

function normalizeHex(value: string | undefined | null): string | null {
  const trimmed = (value ?? "").trim().toUpperCase()
  if (/^#[0-9A-F]{8}$/.test(trimmed)) return trimmed
  if (/^#[0-9A-F]{6}$/.test(trimmed)) return trimmed
  if (/^#[0-9A-F]{6}/.test(trimmed)) return trimmed.slice(0, 7)
  return null
}

function toStoredHex(
  formats: Record<string, string> | undefined,
  fallback: string
) {
  const fromFormats = normalizeHex(formats?.hex)
  if (fromFormats) return fromFormats
  return normalizeHex(fallback) ?? DEFAULT_PROJECT_THEME_COLOR
}

function readSavedSwatches(): string[] {
  try {
    const raw = window.localStorage.getItem(SAVED_SWATCHES_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => (typeof entry === "string" ? normalizeHex(entry) : null))
      .filter((entry): entry is string => entry != null)
  } catch {
    return []
  }
}

function writeSavedSwatches(swatches: string[]) {
  window.localStorage.setItem(SAVED_SWATCHES_KEY, JSON.stringify(swatches))
}

function hexToChromeValue(hex: string): BlossomColorPickerValue {
  const normalized = normalizeHex(hex) ?? DEFAULT_PROJECT_THEME_COLOR
  const rgb = normalized.slice(0, 7)
  const alphaHex = normalized.length === 9 ? normalized.slice(7, 9) : "FF"
  const alpha = Math.round((Number.parseInt(alphaHex, 16) / 255) * 100)
  const hsl = hexToHsl(rgb)
  return {
    hue: hsl.h,
    saturation: Math.max(0, Math.min(100, 100 - hsl.l)),
    lightness: hsl.l,
    originalSaturation: hsl.s,
    alpha,
    layer: "outer",
  }
}

function chromeColorToHex(
  hex: string | undefined,
  alpha: number,
  fallback: string
) {
  const base =
    normalizeHex(hex)?.slice(0, 7) ??
    normalizeHex(fallback)?.slice(0, 7) ??
    DEFAULT_PROJECT_THEME_COLOR
  if (alpha >= 99.5) return base
  const aa = Math.round((Math.max(0, Math.min(100, alpha)) / 100) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase()
  return `${base}${aa}`
}

function ClassicThemeColorPicker({
  colorValue,
  onChange,
  disabled,
  id,
}: {
  colorValue: string
  onChange: (hex: string) => void
  disabled?: boolean
  id: string
}) {
  const [color, setColor] = React.useState<OklchColor>(() =>
    toOklch(colorValue)
  )
  const [savedSwatches, setSavedSwatches] = React.useState<string[]>([])
  const [display, setDisplay] = React.useState(colorValue)

  React.useEffect(() => {
    setColor(toOklch(colorValue))
    setDisplay(colorValue)
  }, [colorValue])

  React.useEffect(() => {
    setSavedSwatches(readSavedSwatches())
  }, [])

  const presets = [...SHADCN_SWATCH_STARTERS, ...savedSwatches]

  return (
    <Popover>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-md border border-input bg-background px-2.5 text-sm shadow-xs",
          "hover:bg-accent hover:text-accent-foreground",
          "disabled:pointer-events-none disabled:opacity-50"
        )}
      >
        <span
          aria-hidden
          className="size-6 shrink-0 rounded-md border border-border"
          style={{ backgroundColor: colorValue }}
        />
        <span className="font-mono text-xs uppercase">{display}</span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-72 border-0 bg-transparent p-0 shadow-none ring-0"
      >
        <ColorPicker.Root
          value={color}
          defaultFormat="hex"
          formats={["hex", "rgb", "hsl"]}
          backgroundColor="#ffffff"
          onValueChange={(next, formatted, formats) => {
            setColor(next)
            const stored = toStoredHex(formats, colorValue)
            setDisplay(formatted || stored)
            onChange(stored)
          }}
          className="rounded-xl border border-border bg-popover p-3 shadow-md"
        >
          <ColorPicker.Area mode="oklch-cl" className="h-36" />
          <ColorPicker.Hue />
          <ColorPicker.Alpha />
          <div className="flex items-center gap-2">
            <ColorPicker.FormatSwitcher className="min-w-0 flex-1" />
            <ColorPicker.EyeDropper className="size-8 shrink-0" />
          </div>
          <ColorPicker.ChannelInput showFormat={false} />
          <ColorPicker.Swatches
            presets={presets}
            onAdd={(_nextColor, addedHex) => {
              const nextHex = normalizeHex(addedHex)
              if (!nextHex) return
              setSavedSwatches((prev) => {
                if (prev.includes(nextHex)) return prev
                const next = [...prev, nextHex]
                writeSavedSwatches(next)
                return next
              })
            }}
          />
          <ColorPicker.Preview />
        </ColorPicker.Root>
      </PopoverContent>
    </Popover>
  )
}

const colorPalette = [
  // --- Layer 1: Outermost (12 Colors) ---
  "#E67700",
  "#D9480F",
  "#C92A2A",
  "#A61E4D",
  "#862E9C",
  "#5F3DC4",
  "#364FC7",
  "#1864AB",
  "#0B7285",
  "#087F5B",
  "#2B8A3E",
  "#5C940D",
  // --- Layer 2: Middle-Outer (12 Colors) ---
  "#FCC419",
  "#FF922B",
  "#FF6B6B",
  "#F06595",
  "#CC5DE8",
  "#845EF7",
  "#5C7CFA",
  "#339AF0",
  "#22B8CF",
  "#20C997",
  "#51CF66",
  "#94D82D",
  // --- Layer 3: Middle-Inner (12 Colors) ---
  "#FFE066",
  "#FFC078",
  "#FFA8A8",
  "#FCC2D7",
  "#E599F7",
  "#B197FC",
  "#91A7FF",
  "#74C0FC",
  "#66D9E8",
  "#63E6BE",
  "#8CE99A",
  "#C0EB75",
  // --- Layer 4: Innermost (6 Colors) ---
  "#FFF9DB",
  "#FFF5F5",
  "#F3D9FA",
  "#E7F5FF",
  "#E6FCF5",
  "#F4FCE3",
]

function ChromeThemeColorPicker({
  colorValue,
  onChange,
  disabled,
  id,
}: {
  colorValue: string
  onChange: (hex: string) => void
  disabled?: boolean
  id: string
}) {
  const { isDark } = useTheme()
  const [value, setValue] = React.useState<BlossomColorPickerValue>(() =>
    hexToChromeValue(colorValue)
  )
  const [display, setDisplay] = React.useState(colorValue)

  React.useEffect(() => {
    setValue(hexToChromeValue(colorValue))
    setDisplay(colorValue)
  }, [colorValue])

  return (
    <Popover>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-md border border-input bg-background px-2.5 text-sm shadow-xs",
          "hover:bg-accent hover:text-accent-foreground",
          "disabled:pointer-events-none disabled:opacity-50"
        )}
      >
        <span
          aria-hidden
          className="size-6 shrink-0 rounded-md border border-border"
          style={{ backgroundColor: colorValue }}
        />
        <span className="font-mono text-xs uppercase">{display}</span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-auto border-0 bg-transparent p-0 shadow-none ring-0"
      >
        <div className="overflow-x-auto rounded-xl border border-border bg-popover p-3 shadow-md">
          <ChromePicker
            colors={colorPalette}
            value={value}
            disabled={disabled}
            showAlphaSlider
            darkMode={isDark}
            coreSize={36}
            petalSize={28}
            sliderWidth={14}
            adaptivePositioning={false}
            onChange={(next) => {
              setValue(next)
              const stored = chromeColorToHex(next.hex, next.alpha, colorValue)
              setDisplay(stored)
              onChange(stored)
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ProjectThemeColorField({
  value,
  onChange,
  disabled,
  id = "project-theme-color",
}: {
  value: string
  onChange: (hex: string) => void
  disabled?: boolean
  id?: string
}) {
  const { user } = useAuth()
  const preference = user?.colorPickerPreference ?? "classic"
  const colorValue =
    normalizeHex(value) ??
    normalizeHex(DEFAULT_PROJECT_THEME_COLOR) ??
    DEFAULT_PROJECT_THEME_COLOR

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Theme color</Label>
      {preference === "blossom" ? (
        <ChromeThemeColorPicker
          id={id}
          colorValue={colorValue}
          onChange={onChange}
          disabled={disabled}
        />
      ) : (
        <ClassicThemeColorPicker
          id={id}
          colorValue={colorValue}
          onChange={onChange}
          disabled={disabled}
        />
      )}
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        Used in stand-ups.
        {preference === "classic"
          ? " Switch hex / rgb / hsl, and use + to save a swatch."
          : " Chrome picker supports hex, rgba, and hsla with an alpha slider."}{" "}
        Change the picker in Profile → Appearance.
      </p>
    </div>
  )
}

/** Accepts #RRGGBB or #RRGGBBAA for project theme persistence. */
export function normalizeThemeColorForSave(value: string): string {
  return (
    normalizeHex(value) ??
    normalizeHex(DEFAULT_PROJECT_THEME_COLOR) ??
    DEFAULT_PROJECT_THEME_COLOR
  )
}

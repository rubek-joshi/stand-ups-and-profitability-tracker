import * as React from "react"
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

function toOklch(hex: string): OklchColor {
  return (
    parseColor(hex.trim() || DEFAULT_PROJECT_THEME_COLOR) ??
    parseColor(DEFAULT_PROJECT_THEME_COLOR)!
  )
}

function toHex(formats: Record<string, string> | undefined, fallback: string) {
  const hex = formats?.hex?.toUpperCase()
  if (hex && /^#[0-9A-F]{6}/.test(hex)) return hex.slice(0, 7)
  return fallback
}

function normalizeSavedHex(hex: string) {
  const trimmed = hex.trim().toUpperCase()
  if (/^#[0-9A-F]{6}/.test(trimmed)) return trimmed.slice(0, 7)
  return null
}

function readSavedSwatches(): string[] {
  try {
    const raw = window.localStorage.getItem(SAVED_SWATCHES_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => (typeof entry === "string" ? normalizeSavedHex(entry) : null))
      .filter((entry): entry is string => entry != null)
  } catch {
    return []
  }
}

function writeSavedSwatches(swatches: string[]) {
  window.localStorage.setItem(SAVED_SWATCHES_KEY, JSON.stringify(swatches))
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
  const hex = value?.trim() || DEFAULT_PROJECT_THEME_COLOR
  // Canonical OKLCH state — lossless while picking; parent stores hex for the API.
  const [color, setColor] = React.useState<OklchColor>(() => toOklch(hex))
  const [savedSwatches, setSavedSwatches] = React.useState<string[]>([])

  React.useEffect(() => {
    setColor(toOklch(hex))
  }, [hex])

  React.useEffect(() => {
    setSavedSwatches(readSavedSwatches())
  }, [])

  const presets = [...SHADCN_SWATCH_STARTERS, ...savedSwatches]

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Theme color</Label>
      <Popover>
        <PopoverTrigger
          id={id}
          disabled={disabled}
          aria-describedby={`${id}-hint`}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-md border border-input bg-background px-2.5 text-sm shadow-xs",
            "hover:bg-accent hover:text-accent-foreground",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          <span
            aria-hidden
            className="size-6 shrink-0 rounded-md border border-border"
            style={{ backgroundColor: hex }}
          />
          <span className="font-mono text-xs uppercase">{hex}</span>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          className="w-72 border-0 bg-transparent p-0 shadow-none ring-0"
        >
          <ColorPicker.Root
            value={color}
            defaultFormat="hex"
            formats={["hex", "rgb", "oklch"]}
            backgroundColor="#ffffff"
            onValueChange={(next, _formatted, formats) => {
              setColor(next)
              onChange(toHex(formats, hex))
            }}
            className="rounded-xl border border-border bg-popover p-3 shadow-md"
          >
            <ColorPicker.Area mode="oklch-cl" className="h-36" />
            <ColorPicker.Hue />
            <div className="flex items-center gap-2">
              <ColorPicker.FormatSwitcher className="min-w-0 flex-1" />
              <ColorPicker.EyeDropper className="size-8 shrink-0" />
            </div>
            <ColorPicker.ChannelInput showFormat={false} />
            <ColorPicker.Swatches
              presets={presets}
              onAdd={(_color, addedHex) => {
                const nextHex = normalizeSavedHex(addedHex)
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
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        This will be used in stand-ups. Use + to save the current color.
      </p>
    </div>
  )
}

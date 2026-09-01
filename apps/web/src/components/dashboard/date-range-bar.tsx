import { IconCalendar } from "@tabler/icons-react"
import { format } from "date-fns"
import type { DateRange as DayPickerRange } from "react-day-picker"
import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"
import { toIsoDateInput, type DateRange } from "@/lib/dashboard-metrics"

export const PRESETS = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "1Y", days: 365 },
] as const

export const DEFAULT_PRESET_DAYS = 90

export function rangeFromDays(days: number): DateRange {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - days)
  from.setHours(0, 0, 0, 0)
  to.setHours(23, 59, 59, 999)
  return { from, to }
}

export function activePresetFromRange(range: DateRange): number | null {
  const fromKey = toIsoDateInput(range.from)
  const toKey = toIsoDateInput(range.to)
  for (const preset of PRESETS) {
    const candidate = rangeFromDays(preset.days)
    if (
      toIsoDateInput(candidate.from) === fromKey &&
      toIsoDateInput(candidate.to) === toKey
    ) {
      return preset.days
    }
  }
  return null
}

export function DateRangeBar({
  range,
  onChange,
  activePreset,
  onPreset,
}: {
  range: DateRange
  onChange: (r: DateRange) => void
  activePreset: number | null
  onPreset: (days: number) => void
}) {
  const value: DayPickerRange = { from: range.from, to: range.to }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border bg-card p-1">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onPreset(p.days)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              activePreset === p.days
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              className="justify-start gap-2 font-normal"
            />
          }
        >
          <IconCalendar className="size-4" />
          {format(range.from, "d MMM yyyy")} — {format(range.to, "d MMM yyyy")}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            defaultMonth={range.from}
            selected={value}
            onSelect={(r) => {
              if (r?.from && r.to) {
                onChange({ from: r.from, to: r.to })
              }
            }}
            numberOfMonths={2}
            className="p-3"
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

import { cn } from "@workspace/ui/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import type { AttendanceStatus } from "@/lib/types"
import { ATTENDANCE_OPTIONS } from "./entry-draft"

const statusActive: Record<AttendanceStatus, string> = {
  present:
    "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
  late: "bg-orange-600/90 text-secondary-foreground hover:bg-secondary",
  first_half_leave: "bg-amber-600/90 text-secondary-foreground hover:bg-secondary",
  second_half_leave: "bg-amber-600/90 text-secondary-foreground hover:bg-secondary",
  absent:
    "bg-destructive text-destructive-foreground hover:bg-destructive hover:text-destructive-foreground",
}

/** Pill buttons — used in card view header. */
export function StatusSelect({
  value,
  onChange,
  disabled,
  compact = false,
}: {
  value: AttendanceStatus
  onChange: (v: AttendanceStatus) => void
  disabled?: boolean
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-1",
        disabled && "pointer-events-none opacity-60",
      )}
      role="group"
      aria-label="Attendance status"
    >
      {ATTENDANCE_OPTIONS.map((option) => {
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            title={option.label}
            aria-label={option.label}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
              compact ? "min-w-8" : "min-w-9",
              active
                ? statusActive[option.value]
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {compact ? option.short : option.label}
          </button>
        )
      })}
    </div>
  )
}

/** Dropdown — used in table view; defaults to Present when unset. */
export function StatusDropdown({
  value,
  onChange,
  disabled,
}: {
  value: AttendanceStatus
  onChange: (v: AttendanceStatus) => void
  disabled?: boolean
}) {
  const selected = value || "present"
  const items = Object.fromEntries(
    ATTENDANCE_OPTIONS.map((option) => [option.value, option.label]),
  )
  return (
    <Select
      value={selected}
      disabled={disabled}
      items={items}
      onValueChange={(next) => {
        if (next) onChange(next as AttendanceStatus)
      }}
    >
      <SelectTrigger className="w-44" aria-label="Attendance status">
        <SelectValue placeholder="Present" />
      </SelectTrigger>
      <SelectContent>
        {ATTENDANCE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

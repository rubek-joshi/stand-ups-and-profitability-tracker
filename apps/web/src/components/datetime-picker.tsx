import * as React from "react"
import {
  addMonths,
  addYears,
  endOfMonth,
  endOfYear,
  format,
  startOfMonth,
  startOfYear,
} from "date-fns"
import { IconCalendar, IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

const NPT_TIME_ZONE = "Asia/Kathmandu"
const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const

type CalendarView = "day" | "month" | "year"

export type DateTimePickerProps = {
  value: Date | undefined
  onChange: (date: Date | undefined) => void
  min?: Date
  max?: Date
  timezone?: string
  disabled?: boolean
  hideTime?: boolean
  clearable?: boolean
  modal?: boolean
  classNames?: { trigger?: string }
  renderTrigger?: (props: {
    value: Date | undefined
    open: boolean
    setOpen: (open: boolean) => void
    disabled?: boolean
  }) => React.ReactNode
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function decadeStartYear(year: number) {
  return Math.floor(year / 10) * 10
}

function isBeforeDay(a: Date, b: Date) {
  return startOfLocalDay(a).getTime() < startOfLocalDay(b).getTime()
}

function isAfterDay(a: Date, b: Date) {
  return startOfLocalDay(a).getTime() > startOfLocalDay(b).getTime()
}

function monthDisabled(year: number, monthIndex: number, min?: Date, max?: Date) {
  const start = new Date(year, monthIndex, 1)
  const end = endOfMonth(start)
  if (min && isBeforeDay(end, min)) return true
  if (max && isAfterDay(start, max)) return true
  return false
}

function yearDisabled(year: number, min?: Date, max?: Date) {
  const start = startOfYear(new Date(year, 0, 1))
  const end = endOfYear(start)
  if (min && isBeforeDay(end, min)) return true
  if (max && isAfterDay(start, max)) return true
  return false
}

function CalendarNavHeader({
  view,
  viewDate,
  min,
  max,
  onViewChange,
  onViewDateChange,
}: {
  view: CalendarView
  viewDate: Date
  min?: Date
  max?: Date
  onViewChange: (view: CalendarView) => void
  onViewDateChange: (date: Date) => void
}) {
  const year = viewDate.getFullYear()
  const decadeStart = decadeStartYear(year)
  const decadeEnd = decadeStart + 9

  const prevDisabled =
    view === "day"
      ? Boolean(min && isBeforeDay(endOfMonth(addMonths(viewDate, -1)), min))
      : view === "month"
        ? yearDisabled(year - 1, min, max)
        : yearDisabled(decadeStart - 1, min, max)

  const nextDisabled =
    view === "day"
      ? Boolean(max && isAfterDay(startOfMonth(addMonths(viewDate, 1)), max))
      : view === "month"
        ? yearDisabled(year + 1, min, max)
        : yearDisabled(decadeEnd + 1, min, max)

  const prevLabel =
    view === "day"
      ? "Previous month"
      : view === "month"
        ? "Previous year"
        : "Previous decade"
  const nextLabel =
    view === "day" ? "Next month" : view === "month" ? "Next year" : "Next decade"

  function shift(delta: number) {
    if (view === "day") onViewDateChange(addMonths(viewDate, delta))
    else if (view === "month") onViewDateChange(addYears(viewDate, delta))
    else onViewDateChange(addYears(viewDate, delta * 10))
  }

  return (
    <div className="relative flex h-8 items-center justify-between gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={prevLabel}
        disabled={prevDisabled}
        onClick={() => shift(-1)}
      >
        <IconChevronLeft />
      </Button>
      <div className="flex min-w-0 items-center justify-center gap-0.5">
        {view === "day" ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-1.5 font-medium"
              aria-label="Choose month"
              onClick={() => onViewChange("month")}
            >
              {format(viewDate, "MMMM")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-1.5 font-medium"
              aria-label="Choose year"
              onClick={() => onViewChange("year")}
            >
              {year}
            </Button>
          </>
        ) : null}
        {view === "month" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-1.5 font-medium"
            aria-label="Choose year"
            onClick={() => onViewChange("year")}
          >
            {year}
          </Button>
        ) : null}
        {view === "year" ? (
          <span className="px-1.5 text-sm font-medium">
            {decadeStart} – {decadeEnd}
          </span>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={nextLabel}
        disabled={nextDisabled}
        onClick={() => shift(1)}
      >
        <IconChevronRight />
      </Button>
    </div>
  )
}

function MonthGrid({
  viewDate,
  selected,
  min,
  max,
  onSelect,
}: {
  viewDate: Date
  selected?: Date
  min?: Date
  max?: Date
  onSelect: (monthIndex: number) => void
}) {
  const year = viewDate.getFullYear()
  const today = startOfLocalDay(new Date())
  return (
    <div className="grid grid-cols-3 gap-1 p-1">
      {MONTH_LABELS.map((label, monthIndex) => {
        const isSelected =
          selected?.getFullYear() === year && selected.getMonth() === monthIndex
        const isCurrent = today.getFullYear() === year && today.getMonth() === monthIndex
        const disabled = monthDisabled(year, monthIndex, min, max)
        return (
          <Button
            key={label}
            type="button"
            size="sm"
            variant={isSelected ? "secondary" : "ghost"}
            disabled={disabled}
            aria-label={`${label} ${year}`}
            aria-pressed={isSelected}
            aria-current={isCurrent ? "date" : undefined}
            className={cn(
              "h-10 font-normal",
              isCurrent && !isSelected && "bg-muted",
            )}
            onClick={() => onSelect(monthIndex)}
          >
            {label.slice(0, 3)}
          </Button>
        )
      })}
    </div>
  )
}

function YearGrid({
  viewDate,
  selected,
  min,
  max,
  onSelect,
}: {
  viewDate: Date
  selected?: Date
  min?: Date
  max?: Date
  onSelect: (year: number) => void
}) {
  const decadeStart = decadeStartYear(viewDate.getFullYear())
  const years = Array.from({ length: 12 }, (_, index) => decadeStart - 1 + index)
  const todayYear = new Date().getFullYear()
  return (
    <div className="grid grid-cols-4 gap-1 p-1">
      {years.map((year) => {
        const outside = year < decadeStart || year > decadeStart + 9
        const isSelected = selected?.getFullYear() === year
        const isCurrent = todayYear === year
        const disabled = yearDisabled(year, min, max)
        return (
          <Button
            key={year}
            type="button"
            size="sm"
            variant={isSelected ? "secondary" : "ghost"}
            disabled={disabled}
            aria-label={String(year)}
            aria-pressed={isSelected}
            aria-current={isCurrent ? "date" : undefined}
            className={cn(
              "h-10 font-normal",
              outside && "text-muted-foreground",
              isCurrent && !isSelected && "bg-muted",
            )}
            onClick={() => onSelect(year)}
          >
            {year}
          </Button>
        )
      })}
    </div>
  )
}

/**
 * Date picker with Mantine-style day → month → year drill-down,
 * built on the existing shadcn Calendar (react-day-picker v10).
 */
export function DateTimePicker({
  value,
  onChange,
  min,
  max,
  timezone = NPT_TIME_ZONE,
  disabled,
  hideTime = true,
  clearable,
  modal = false,
  classNames,
  renderTrigger,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [view, setView] = React.useState<CalendarView>("day")
  const selected = value ? startOfLocalDay(value) : undefined
  const minDay = min ? startOfLocalDay(min) : undefined
  const maxDay = max ? startOfLocalDay(max) : undefined
  const [viewDate, setViewDate] = React.useState(() =>
    startOfMonth(selected ?? new Date()),
  )

  const label = selected
    ? format(selected, hideTime ? "yyyy-MM-dd" : "yyyy-MM-dd HH:mm")
    : "Pick a date"

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setView("day")
      setViewDate(startOfMonth(selected ?? new Date()))
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={modal}>
      {renderTrigger ? (
        renderTrigger({
          value: selected,
          open,
          setOpen: handleOpenChange,
          disabled,
        })
      ) : (
        <PopoverTrigger
          disabled={disabled}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "w-full justify-start gap-2 font-normal",
            !selected && "text-muted-foreground",
            classNames?.trigger,
          )}
        >
          <IconCalendar />
          <span className="truncate">{label}</span>
          {clearable && selected ? (
            <span
              role="button"
              tabIndex={0}
              className="ml-auto rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onChange(undefined)
                setOpen(false)
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return
                event.preventDefault()
                event.stopPropagation()
                onChange(undefined)
                setOpen(false)
              }}
            >
              <IconX className="size-3.5" />
            </span>
          ) : null}
        </PopoverTrigger>
      )}
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex w-66 flex-col gap-1 p-3">
          <CalendarNavHeader
            view={view}
            viewDate={viewDate}
            min={minDay}
            max={maxDay}
            onViewChange={setView}
            onViewDateChange={setViewDate}
          />
          {view === "day" ? (
            <Calendar
              mode="single"
              selected={selected}
              month={viewDate}
              onMonthChange={(next) => setViewDate(startOfMonth(next))}
              onSelect={(next) => {
                if (!next) return
                onChange(startOfLocalDay(next))
                if (hideTime) setOpen(false)
              }}
              disabled={[
                ...(minDay ? [{ before: minDay }] : []),
                ...(maxDay ? [{ after: maxDay }] : []),
              ]}
              timeZone={timezone}
              className="p-0"
              classNames={{
                nav: "hidden",
                month_caption: "hidden",
              }}
            />
          ) : null}
          {view === "month" ? (
            <MonthGrid
              viewDate={viewDate}
              selected={selected}
              min={minDay}
              max={maxDay}
              onSelect={(monthIndex) => {
                setViewDate(new Date(viewDate.getFullYear(), monthIndex, 1))
                setView("day")
              }}
            />
          ) : null}
          {view === "year" ? (
            <YearGrid
              viewDate={viewDate}
              selected={selected}
              min={minDay}
              max={maxDay}
              onSelect={(year) => {
                setViewDate(new Date(year, viewDate.getMonth(), 1))
                setView("month")
              }}
            />
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function parseIsoDay(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number)
  return new Date(year, month - 1, day)
}

export function formatIsoDay(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** YYYY-MM-DD controlled date input built on DateTimePicker. */
export function DatePicker({
  value,
  onChange,
  min,
  max,
  disabled,
  clearable,
  modal,
  className,
}: {
  value?: string
  onChange: (value: string | undefined) => void
  min?: string
  max?: string
  disabled?: boolean
  clearable?: boolean
  modal?: boolean
  className?: string
}) {
  const date = value ? parseIsoDay(value) : undefined
  return (
    <DateTimePicker
      value={date}
      onChange={(next) => onChange(next ? formatIsoDay(next) : undefined)}
      min={min ? parseIsoDay(min) : undefined}
      max={max ? parseIsoDay(max) : undefined}
      hideTime
      timezone={NPT_TIME_ZONE}
      disabled={disabled}
      clearable={clearable}
      modal={modal}
      classNames={{ trigger: className }}
    />
  )
}

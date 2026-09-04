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
import { Input } from "@workspace/ui/components/input"
import {
  dateInputErrorMessage,
  dateStringParser,
  formatDateInputValue,
  isDateValid,
} from "@/lib/date-input"

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

/** Subset of Base UI's popover change details we rely on. */
export type PopoverOpenChangeDetails = {
  reason?: string
  event?: Event
  cancel?: () => void
}

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
  /** Controlled open state. */
  open?: boolean
  onOpenChange?: (open: boolean, details?: PopoverOpenChangeDetails) => void
  /** Close the popover after picking a day. @default true */
  closeOnSelect?: boolean
  /**
   * When false, opening the calendar does not move focus into the popup
   * (keeps a text input caret). @default true
   */
  autoFocus?: boolean
  /**
   * Position the popup against this element instead of a PopoverTrigger.
   * When set, `renderTrigger` is rendered as a plain node (not a toggle trigger).
   */
  anchorRef?: React.RefObject<Element | null>
  classNames?: { trigger?: string }
  renderTrigger?: (props: {
    value: Date | undefined
    open: boolean
    setOpen: (open: boolean) => void
    disabled?: boolean
  }) => React.ReactNode
}

function detailsCanceled(details: PopoverOpenChangeDetails): boolean {
  return Boolean((details as { isCanceled?: boolean }).isCanceled)
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
  open: openProp,
  onOpenChange,
  closeOnSelect = true,
  autoFocus = true,
  anchorRef,
  classNames,
  renderTrigger,
}: DateTimePickerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const isOpenControlled = openProp !== undefined
  const open = isOpenControlled ? Boolean(openProp) : uncontrolledOpen
  const [view, setView] = React.useState<CalendarView>("day")
  const selected = value ? startOfLocalDay(value) : undefined
  const minDay = min ? startOfLocalDay(min) : undefined
  const maxDay = max ? startOfLocalDay(max) : undefined
  const [viewDate, setViewDate] = React.useState(() =>
    startOfMonth(selected ?? new Date()),
  )
  const useAnchor = Boolean(anchorRef)

  const label = selected
    ? format(selected, hideTime ? "yyyy-MM-dd" : "yyyy-MM-dd HH:mm")
    : "Pick a date"

  function handleOpenChange(next: boolean, details?: PopoverOpenChangeDetails) {
    onOpenChange?.(next, details)
    if (details && detailsCanceled(details)) {
      return
    }
    if (!isOpenControlled) {
      setUncontrolledOpen(next)
    }
    if (next) {
      setView("day")
      setViewDate(startOfMonth(selected ?? new Date()))
    }
  }

  // Keep the calendar on the selected month while open (e.g. typing a date).
  const selectedTime = selected?.getTime()
  React.useEffect(() => {
    if (!open || selectedTime == null) return
    setViewDate(startOfMonth(new Date(selectedTime)))
    setView("day")
  }, [open, selectedTime])

  const calendar = (
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
            if (hideTime && closeOnSelect) handleOpenChange(false)
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
  )

  const popup = (
    <PopoverContent
      className="w-auto p-0"
      align="start"
      anchor={useAnchor ? anchorRef : undefined}
      initialFocus={autoFocus}
      finalFocus={autoFocus}
      onMouseDown={(event) => {
        // Keep focus in the text input (Mantine DateInput behavior).
        if (!autoFocus) {
          event.preventDefault()
        }
      }}
    >
      {calendar}
    </PopoverContent>
  )

  if (useAnchor) {
    return (
      <Popover open={open} onOpenChange={handleOpenChange} modal={modal}>
        {renderTrigger?.({
          value: selected,
          open,
          setOpen: handleOpenChange,
          disabled,
        })}
        {popup}
      </Popover>
    )
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={modal}>
      {renderTrigger ? (
        <PopoverTrigger
          disabled={disabled}
          nativeButton={false}
          render={
            renderTrigger({
              value: selected,
              open,
              setOpen: handleOpenChange,
              disabled,
            }) as React.ReactElement
          }
        />
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
                handleOpenChange(false)
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return
                event.preventDefault()
                event.stopPropagation()
                onChange(undefined)
                handleOpenChange(false)
              }}
            >
              <IconX className="size-3.5" />
            </span>
          ) : null}
        </PopoverTrigger>
      )}
      {popup}
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

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",")

function isVisibleTabbable(element: HTMLElement) {
  if (element.getAttribute("tabindex") === "-1") return false
  if (
    element.hasAttribute("inert") ||
    element.getAttribute("aria-hidden") === "true" ||
    element.hasAttribute("data-floating-ui-focus-guard") ||
    element.hasAttribute("data-base-ui-focus-guard")
  ) {
    return false
  }
  return element.offsetParent !== null || element.getClientRects().length > 0
}

/** Mantine-style date field: type/paste freely while focused; format on blur. */
export function DateInput({
  value,
  onChange,
  min,
  max,
  disabled,
  clearable,
  modal: _modal,
  className,
  placeholder = "YYYY-MM-DD",
  fixOnBlur = true,
  id,
  "aria-label": ariaLabel,
}: {
  value?: string
  onChange: (value: string | undefined) => void
  min?: string
  max?: string
  disabled?: boolean
  clearable?: boolean
  modal?: boolean
  className?: string
  placeholder?: string
  fixOnBlur?: boolean
  id?: string
  "aria-label"?: string
}) {
  const [inputValue, setInputValue] = React.useState(() =>
    formatDateInputValue(value),
  )
  const [open, setOpen] = React.useState(false)
  const [touched, setTouched] = React.useState(false)
  // Value present when the field was focused — used to restore on invalid blur.
  const baselineRef = React.useRef<string | undefined>(value)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const inputValueRef = React.useRef(inputValue)

  function updateInputValue(next: string) {
    inputValueRef.current = next
    setInputValue(next)
  }

  function focusInput() {
    requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
  }

  // Mirror the controlled value into the text field only when not editing.
  React.useEffect(() => {
    if (!open) {
      const formatted = formatDateInputValue(value)
      inputValueRef.current = formatted
      setInputValue(formatted)
    }
  }, [value, open])

  const selected = value ? parseIsoDay(value) : undefined
  const error =
    touched && !open
      ? dateInputErrorMessage({
          text: inputValue,
          value,
          minDate: min,
          maxDate: max,
        })
      : null

  function restoreBaseline() {
    const baseline = baselineRef.current
    onChange(baseline)
    updateInputValue(formatDateInputValue(baseline))
    setTouched(false)
  }

  function commitInputValue() {
    if (!fixOnBlur) {
      setTouched(true)
      return
    }

    const trimmed = inputValueRef.current.trim()
    if (!trimmed) {
      if (
        clearable ||
        baselineRef.current == null ||
        baselineRef.current === ""
      ) {
        baselineRef.current = undefined
        onChange(undefined)
        updateInputValue("")
        setTouched(false)
        return
      }
      restoreBaseline()
      return
    }

    const parsed = dateStringParser(trimmed)
    if (parsed && isDateValid({ date: parsed, minDate: min, maxDate: max })) {
      onChange(parsed)
      updateInputValue(formatDateInputValue(parsed))
      baselineRef.current = parsed
      setTouched(false)
      return
    }

    restoreBaseline()
  }

  function closeCalendar() {
    setOpen(false)
  }

  function closeField() {
    setOpen(false)
    commitInputValue()
  }

  function openField() {
    baselineRef.current = value
    setOpen(true)
    focusInput()
  }

  function handleInputChange(raw: string) {
    updateInputValue(raw)

    const trimmed = raw.trim()
    if (!trimmed) return

    const parsed = dateStringParser(trimmed)
    if (parsed && isDateValid({ date: parsed, minDate: min, maxDate: max })) {
      onChange(parsed)
    }
  }

  // Tab must reach the next form field, never the calendar popup (which is
  // portaled after everything else in the DOM).
  function moveFocusToAdjacentField(backwards: boolean) {
    const input = inputRef.current
    if (!input) return

    // Stay inside the dialog when the field lives in one, mirroring its focus trap.
    const scope = input.closest<HTMLElement>('[role="dialog"]') ?? document.body
    const candidates = Array.from(
      scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter(
      (element) =>
        !element.closest('[data-slot="popover-content"]') &&
        (element === input || isVisibleTabbable(element)),
    )

    const index = candidates.indexOf(input)
    if (index === -1 || candidates.length < 2) return

    const offset = backwards ? -1 : 1
    const next =
      candidates[(index + offset + candidates.length) % candidates.length]
    next?.focus()
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div ref={rootRef} className="relative w-full">
        <DateTimePicker
          value={selected}
          open={open}
          onOpenChange={(next, details) => {
            if (next) {
              baselineRef.current = value
              setOpen(true)
              return
            }
            // Pressing the input or the calendar icon reads as an outside press
            // (the field is an anchor, not a trigger) — keep the calendar open.
            const target = details?.event?.target
            if (
              details?.reason === "outside-press" &&
              target instanceof Node &&
              rootRef.current?.contains(target)
            ) {
              details.cancel?.()
              return
            }
            closeField()
          }}
          closeOnSelect
          autoFocus={false}
          anchorRef={rootRef}
          onChange={(next) => {
            const nextValue = next ? formatIsoDay(next) : undefined
            onChange(nextValue)
            updateInputValue(formatDateInputValue(nextValue))
            baselineRef.current = nextValue
            setTouched(false)
            focusInput()
          }}
          min={min ? parseIsoDay(min) : undefined}
          max={max ? parseIsoDay(max) : undefined}
          hideTime
          timezone={NPT_TIME_ZONE}
          disabled={disabled}
          clearable={clearable}
          modal={false}
          renderTrigger={({ disabled: pickerDisabled }) => (
            <Input
              ref={inputRef}
              id={id}
              autoComplete="off"
              aria-label={ariaLabel}
              aria-invalid={Boolean(error)}
              disabled={pickerDisabled}
              placeholder={placeholder}
              value={inputValue}
              className={cn("w-full pr-9", error && "border-destructive")}
              onChange={(event) => handleInputChange(event.target.value)}
              onFocus={() => {
                baselineRef.current = value
                setOpen(true)
              }}
              onClick={() => {
                // Re-open after picking a day / pressing Escape without blurring.
                if (!open) {
                  baselineRef.current = value
                  setOpen(true)
                }
              }}
              onBlur={(event) => {
                const next = event.relatedTarget
                // Keep open when focus moves into the calendar popup.
                if (
                  next instanceof Element &&
                  next.closest('[data-slot="popover-content"]')
                ) {
                  return
                }
                // Keep open when focus moves to the calendar icon button.
                if (
                  next instanceof Node &&
                  rootRef.current?.contains(next)
                ) {
                  return
                }
                closeField()
              }}
              onKeyDown={(event) => {
                if (event.key === "Tab") {
                  // Skip the portaled calendar and land on the next form field;
                  // the resulting blur closes the calendar and commits.
                  event.preventDefault()
                  moveFocusToAdjacentField(event.shiftKey)
                  return
                }
                if (event.key === "Escape") {
                  event.preventDefault()
                  restoreBaseline()
                  closeCalendar()
                }
                if (event.key === "Enter") {
                  event.preventDefault()
                  closeField()
                }
              }}
            />
          )}
        />
        <button
          type="button"
          disabled={disabled}
          className="absolute inset-y-0 right-0 z-10 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          aria-label="Open calendar"
          tabIndex={-1}
          onMouseDown={(event) => {
            event.preventDefault()
          }}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (open) {
              focusInput()
              return
            }
            openField()
          }}
        >
          <IconCalendar className="size-4" />
        </button>
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

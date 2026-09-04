import { format, isValid, parseISO } from "date-fns"

export type DateStringValue = string

const CANONICAL_DATE_REGEX =
  /^\d{4}-\d{2}-\d{2}([ T]([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?)?$/

function parseIsoDay(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number)
  return new Date(year, month - 1, day)
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function isBeforeDay(a: Date, b: Date) {
  return startOfLocalDay(a).getTime() < startOfLocalDay(b).getTime()
}

function isAfterDay(a: Date, b: Date) {
  return startOfLocalDay(a).getTime() > startOfLocalDay(b).getTime()
}

/** Parse typed or pasted date text into YYYY-MM-DD (Mantine-style). */
export function dateStringParser(
  dateString: string | null | undefined,
): DateStringValue | null {
  if (!dateString?.trim()) {
    return null
  }

  const trimmed = dateString.trim()

  if (CANONICAL_DATE_REGEX.test(trimmed)) {
    const parsed = parseISO(trimmed.slice(0, 10))
    if (!isValid(parsed)) {
      return null
    }
    const canonical = format(parsed, "yyyy-MM-dd")
    return canonical === trimmed.slice(0, 10) ? canonical : null
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return format(parsed, "yyyy-MM-dd")
}

export function isDateValid(input: {
  date: DateStringValue | Date | null | undefined
  minDate?: DateStringValue | Date | null | undefined
  maxDate?: DateStringValue | Date | null | undefined
}): boolean {
  const { date, minDate, maxDate } = input
  if (date == null) {
    return false
  }

  const parsed =
    typeof date === "string" ? parseIsoDay(date.slice(0, 10)) : startOfLocalDay(date)
  if (Number.isNaN(parsed.getTime())) {
    return false
  }

  if (minDate) {
    const min =
      typeof minDate === "string"
        ? parseIsoDay(minDate.slice(0, 10))
        : startOfLocalDay(minDate)
    if (isBeforeDay(parsed, min)) {
      return false
    }
  }

  if (maxDate) {
    const max =
      typeof maxDate === "string"
        ? parseIsoDay(maxDate.slice(0, 10))
        : startOfLocalDay(maxDate)
    if (isAfterDay(parsed, max)) {
      return false
    }
  }

  return true
}

export function formatDateInputValue(value: DateStringValue | undefined): string {
  if (!value) {
    return ""
  }
  return value.slice(0, 10)
}

export function dateInputErrorMessage(input: {
  text: string
  value?: DateStringValue
  minDate?: DateStringValue
  maxDate?: DateStringValue
}): string | null {
  const trimmed = input.text.trim()
  if (!trimmed) {
    return null
  }

  const parsed = dateStringParser(trimmed)
  if (!parsed) {
    return "Enter a valid date"
  }

  if (
    !isDateValid({
      date: parsed,
      minDate: input.minDate,
      maxDate: input.maxDate,
    })
  ) {
    if (input.minDate && input.maxDate) {
      return `Date must be between ${input.minDate} and ${input.maxDate}`
    }
    if (input.minDate) {
      return `Date must be on or after ${input.minDate}`
    }
    if (input.maxDate) {
      return `Date must be on or before ${input.maxDate}`
    }
    return "Date is out of range"
  }

  return null
}

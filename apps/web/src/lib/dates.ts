import { format, formatDuration, intervalToDuration, isAfter, parseISO } from "date-fns"

export function toDateKey(value: string | Date) {
  if (typeof value === "string") return value.slice(0, 10)
  return value.toISOString().slice(0, 10)
}

export function formatJoinedDate(value: string | Date) {
  const key = toDateKey(value)
  const parsed = parseISO(key)
  if (Number.isNaN(parsed.getTime())) return key
  return format(parsed, "d MMM yyyy")
}

/** Relative tenure: "3 months ago" or "2 years 4 months ago". */
export function formatTenureAgo(value: string | Date, now = new Date()) {
  const start = parseISO(toDateKey(value))
  if (Number.isNaN(start.getTime()) || isAfter(start, now)) return "this month"

  const label = formatDuration(intervalToDuration({ start, end: now }), {
    format: ["years", "months"],
  })
  return label ? `${label} ago` : "this month"
}

import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  endOfMonth,
  format,
  isAfter,
  parseISO,
  startOfDay,
  startOfMonth,
} from "date-fns"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Calendar } from "@workspace/ui/components/calendar"
import { ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import type { StandupCalendarDay } from "@/lib/types"

function localIsoDate(date: Date) {
  return format(date, "yyyy-MM-dd")
}

function utcIsoDate(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

type StandupCalendarProps = {
  onMissingDayClick?: (date: string) => void
  refreshKey?: number
}

export function StandupCalendar({
  onMissingDayClick,
  refreshKey = 0,
}: StandupCalendarProps) {
  const navigate = useNavigate()
  const [month, setMonth] = React.useState(() => startOfMonth(new Date()))
  const [days, setDays] = React.useState<StandupCalendarDay[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const today = React.useMemo(() => startOfDay(new Date()), [])

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    const from = localIsoDate(startOfMonth(month))
    const to = localIsoDate(endOfMonth(month))
    try {
      const res = await api<Envelope<StandupCalendarDay[]>>(
        `/standups/calendar?from=${from}&to=${to}`,
      )
      setDays(res.data)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load calendar")
    } finally {
      setLoading(false)
    }
  }, [month])

  React.useEffect(() => {
    void load()
  }, [load, refreshKey])

  const byDate = React.useMemo(
    () => new Map(days.map((d) => [d.date.slice(0, 10), d])),
    [days],
  )

  const enteredDates = React.useMemo(
    () => days.map((d) => parseISO(d.date.slice(0, 10))),
    [days],
  )

  const missingDates = React.useMemo(() => {
    const result: Date[] = []
    const cursor = startOfMonth(month)
    const monthEnd = endOfMonth(month)
    while (cursor <= monthEnd) {
      const key = localIsoDate(cursor)
      const day = startOfDay(cursor)
      if (!isAfter(day, today) && !byDate.has(key)) {
        result.push(day)
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    return result
  }, [month, today, byDate])

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Calendar</CardTitle>
        <p className="text-sm text-muted-foreground">
          Green days have a stand-up. Amber days are past dates with no entry yet.
        </p>
        <div className="flex flex-wrap gap-4 pt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-emerald-500" />
            Entered
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-amber-500" />
            Missing
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <LoadingState label="Loading calendar…" /> : null}
        {error ? <ErrorState message={error} onRetry={load} /> : null}
        {!loading && !error ? (
          <Calendar
            mode="single"
            month={month}
            onMonthChange={setMonth}
            disabled={{ after: today }}
            modifiers={{
              entered: enteredDates,
              missing: missingDates,
            }}
            modifiersClassNames={{
              entered:
                "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 [&_button]:font-semibold",
              missing:
                "bg-amber-500/15 text-amber-900 dark:text-amber-200",
            }}
            onSelect={(day) => {
              if (!day) return
              const key = localIsoDate(day)
              const entry = byDate.get(key)
              if (entry) {
                void navigate({
                  to: "/stand-ups/$id",
                  params: { id: entry.id },
                })
                return
              }
              if (!isAfter(startOfDay(day), today) && onMissingDayClick) {
                onMissingDayClick(key)
              }
            }}
            className="mx-auto rounded-lg border p-3"
          />
        ) : null}
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Click an entered day to open it, or a missing day to create one.
        </p>
      </CardContent>
    </Card>
  )
}

export { utcIsoDate }

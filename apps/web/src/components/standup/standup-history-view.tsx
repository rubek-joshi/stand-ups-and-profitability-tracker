import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  IconCalendar,
  IconChevronRight,
  IconSearch,
  IconUsers,
} from "@tabler/icons-react"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states"
import { isWorking } from "@/components/standup/employee-standup-card"
import { api, ApiError, type Envelope } from "@/lib/api"
import type { AttendanceStatus } from "@/lib/types"
import { format, parseISO } from "date-fns"

export type StandupHistoryRecord = {
  id: string
  employee: { id: string; name: string }
  attendanceStatus: AttendanceStatus
  notesMarkdown: string | null
  allocations: Array<{
    projectId: string
    projectName: string
    percentage: number
    isNonBillable: boolean
  }>
}

export type StandupHistoryDay = {
  date: string
  standupId: string
  status: string
  records: StandupHistoryRecord[]
}

type HistoryMeta = {
  nextCursor: string | null
  hasMore: boolean
}

const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  first_half_leave: "1st half leave",
  second_half_leave: "2nd half leave",
  absent: "Absent",
}

const statusTone: Record<AttendanceStatus, string> = {
  present: "bg-primary/15 text-primary",
  late: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  first_half_leave: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  second_half_leave: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  absent: "bg-destructive/15 text-destructive",
}

function formatHistoryDay(value: string) {
  const key = String(value).slice(0, 10)
  try {
    return format(parseISO(key), "EEEE, d MMMM yyyy")
  } catch {
    return key
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function parseSearchTerms(query: string): string[] {
  const terms: string[] = []
  const re = /"([^"]+)"|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(query.trim())) !== null) {
    terms.push(match[1] ?? match[2] ?? "")
  }
  return [...new Set(terms.filter(Boolean))]
}

function HighlightText({
  text,
  query,
  className,
}: {
  text: string
  query: string
  className?: string
}) {
  const terms = React.useMemo(() => parseSearchTerms(query), [query])

  if (!terms.length) {
    return <span className={className}>{text}</span>
  }

  const pattern = terms.map(escapeRegExp).join("|")
  const parts = text.split(new RegExp(`(${pattern})`, "gi"))
  const lowerTerms = new Set(terms.map((term) => term.toLowerCase()))

  return (
    <span className={className}>
      {parts.map((part, index) =>
        lowerTerms.has(part.toLowerCase()) ? (
          <mark
            key={index}
            className="rounded-sm bg-primary/25 px-0.5 text-foreground"
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={index}>{part}</React.Fragment>
        ),
      )}
    </span>
  )
}

type Props = {
  q: string
  refreshKey?: number
  onSearchChange: (value: string) => void
}

export function StandupHistoryView({ q, refreshKey = 0, onSearchChange }: Props) {
  const [searchInput, setSearchInput] = React.useState(q)
  const [days, setDays] = React.useState<StandupHistoryDay[]>([])
  const [cursor, setCursor] = React.useState<string | null>(null)
  const [hasMore, setHasMore] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const sentinelRef = React.useRef<HTMLDivElement>(null)
  const requestIdRef = React.useRef(0)

  React.useEffect(() => {
    setSearchInput(q)
  }, [q])

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchInput !== q) onSearchChange(searchInput)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput, q, onSearchChange])

  const loadPage = React.useCallback(
    async (opts: { reset: boolean; cursorOverride?: string | null }) => {
      const requestId = ++requestIdRef.current
      if (opts.reset) {
        setLoading(true)
        setError(null)
      } else {
        setLoadingMore(true)
      }

      try {
        const params = new URLSearchParams()
        if (q.trim()) params.set("q", q.trim())
        const nextCursor = opts.reset ? null : (opts.cursorOverride ?? cursor)
        if (nextCursor) params.set("cursor", nextCursor)
        params.set("limit", "10")

        const res = await api<Envelope<StandupHistoryDay[]> & { meta: HistoryMeta }>(
          `/standups/history?${params.toString()}`,
        )
        if (requestId !== requestIdRef.current) return

        setDays((prev) => (opts.reset ? res.data : [...prev, ...res.data]))
        setCursor(res.meta.nextCursor)
        setHasMore(res.meta.hasMore)
        setError(null)
      } catch (e) {
        if (requestId !== requestIdRef.current) return
        setError(e instanceof ApiError ? e.message : "Failed to load history")
        if (opts.reset) setDays([])
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [q, cursor],
  )

  React.useEffect(() => {
    setCursor(null)
    void loadPage({ reset: true })
  }, [q, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore || loading || loadingMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loading && !loadingMore) {
          void loadPage({ reset: false })
        }
      },
      { rootMargin: "240px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loading, loadingMore, loadPage])

  const highlightQuery = q.trim()

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by name, project, or notes…"
          className="pl-9"
          aria-label="Search stand-up history"
        />
      </div>

      {loading ? <LoadingState label="Loading history…" /> : null}
      {error ? (
        <ErrorState message={error} onRetry={() => void loadPage({ reset: true })} />
      ) : null}

      {!loading && !error && days.length === 0 ? (
        <EmptyState
          message={
            q.trim()
              ? "No stand-ups match your search."
              : "No stand-up history yet."
          }
        />
      ) : null}

      <div className="space-y-4">
        {days.map((day) => {
          const working = day.records.filter((record) =>
            isWorking(record.attendanceStatus),
          )
          return (
            <section key={day.standupId} className="rounded-lg border bg-card p-4 sm:p-5">
              <header className="flex flex-wrap items-center gap-3 border-b pb-3">
                <h2 className="flex items-center gap-1.5 text-base font-semibold">
                  <IconCalendar className="size-4 text-primary" />
                  <Link
                    to="/stand-ups/$id"
                    params={{ id: day.standupId }}
                    className="hover:underline"
                  >
                    {formatHistoryDay(day.date)}
                  </Link>
                </h2>
                <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                  <IconUsers className="size-3.5" />
                  {working.length} working · {day.records.length - working.length} absent
                </span>
              </header>

              <ul className="divide-y">
                {day.records.map((record) => (
                  <li key={record.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        <HighlightText
                          text={record.employee.name}
                          query={highlightQuery}
                        />
                      </span>
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 text-xs font-medium capitalize",
                          statusTone[record.attendanceStatus],
                        )}
                      >
                        {ATTENDANCE_LABELS[record.attendanceStatus]}
                      </span>
                      {record.allocations.map((allocation) => (
                        <span
                          key={allocation.projectId}
                          className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground"
                        >
                          <HighlightText
                            text={allocation.projectName}
                            query={highlightQuery}
                          />
                          <IconChevronRight className="size-3" />
                          {allocation.percentage}%
                        </span>
                      ))}
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">
                      {record.notesMarkdown?.trim() ? (
                        <HighlightText
                          text={record.notesMarkdown}
                          query={highlightQuery}
                        />
                      ) : (
                        "No notes recorded."
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      <div ref={sentinelRef} className="flex justify-center py-4">
        {loadingMore ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Loading more…
          </div>
        ) : null}
      </div>
    </div>
  )
}

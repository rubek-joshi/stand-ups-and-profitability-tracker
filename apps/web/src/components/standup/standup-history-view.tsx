import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  IconCalendar,
  IconChevronDown,
  IconChevronRight,
  IconSearch,
  IconUsers,
} from "@tabler/icons-react"
import { Input } from "@workspace/ui/components/input"
import { buttonVariants } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Collapsible,
  CollapsibleContent,
} from "@workspace/ui/components/collapsible"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states"
import {
  DateRangeBar,
  DEFAULT_PRESET_DAYS,
  activePresetFromRange,
  rangeFromDays,
} from "@/components/dashboard/date-range-bar"
import { isWorking } from "@/components/standup/entry-draft"
import { api, ApiError, type Envelope, type PaginatedEnvelope } from "@/lib/api"
import {
  parseLocalIsoDate,
  toIsoDateInput,
  type DateRange,
} from "@/lib/dashboard-metrics"
import type {
  AttendanceStatus,
  Employee,
  Project,
  StandupTask,
  StandupTaskState,
} from "@/lib/types"
import { format, parseISO } from "date-fns"

export type StandupHistoryRecord = {
  id: string
  employee: { id: string; name: string }
  attendanceStatus: AttendanceStatus
  miscellaneousNotes: string | null
  allocations: Array<{
    projectId: string
    projectName: string
    percentage: number
    isNonBillable: boolean
    tasks?: StandupTask[]
  }>
}

export type StandupHistoryDay = {
  date: string
  standupId: string
  status?: string
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

function parseSearchTerms(query: string): string[] {
  const terms: string[] = []
  const re = /"([^"]+)"|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(query.trim())) !== null) {
    terms.push(match[1] ?? match[2] ?? "")
  }
  return [...new Set(terms.filter(Boolean))]
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0] ?? 0
    row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const temp = row[j] ?? 0
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(
        (row[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        prev + cost,
      )
      prev = temp
    }
  }
  return row[b.length] ?? 0
}

function fuzzyTermMatchesWord(term: string, word: string): boolean {
  const lowerTerm = term.toLowerCase()
  const lowerWord = word.toLowerCase()
  if (lowerWord.includes(lowerTerm) || lowerTerm.includes(lowerWord)) return true

  const maxDistance =
    lowerTerm.length <= 3 ? 0 : lowerTerm.length <= 5 ? 1 : 2
  if (maxDistance === 0) return false

  return levenshtein(lowerWord, lowerTerm) <= maxDistance
}

function collectHighlightRanges(text: string, terms: string[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  const lowerText = text.toLowerCase()

  for (const term of terms) {
    const lowerTerm = term.toLowerCase()
    let start = 0
    while ((start = lowerText.indexOf(lowerTerm, start)) !== -1) {
      ranges.push([start, start + term.length])
      start += 1
    }

    const wordPattern = /\S+/g
    let match: RegExpExecArray | null
    while ((match = wordPattern.exec(text)) !== null) {
      const word = match[0]
      const index = match.index
      if (fuzzyTermMatchesWord(term, word)) {
        ranges.push([index, index + word.length])
      }
    }
  }

  ranges.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (!last || range[0] > last[1]) {
      merged.push(range)
    } else {
      last[1] = Math.max(last[1], range[1])
    }
  }
  return merged
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
  const ranges = React.useMemo(
    () => (terms.length ? collectHighlightRanges(text, terms) : []),
    [text, terms],
  )

  if (!ranges.length) {
    return <span className={className}>{text}</span>
  }

  const nodes: React.ReactNode[] = []
  let cursor = 0
  ranges.forEach(([start, end], index) => {
    if (start > cursor) {
      nodes.push(
        <React.Fragment key={`text-${index}`}>{text.slice(cursor, start)}</React.Fragment>,
      )
    }
    nodes.push(
      <mark
        key={`mark-${index}`}
        className="rounded-sm bg-primary/25 px-0.5 text-foreground"
      >
        {text.slice(start, end)}
      </mark>,
    )
    cursor = end
  })
  if (cursor < text.length) {
    nodes.push(<React.Fragment key="tail">{text.slice(cursor)}</React.Fragment>)
  }

  return <span className={className}>{nodes}</span>
}

type Props = {
  q: string
  employeeIds: string[]
  projectId: string
  from: string
  to: string
  refreshKey?: number
  /** Hide project filter control (projectId still applied to the query). */
  hideProjectFilter?: boolean
  onSearchChange: (value: string) => void
  onEmployeeIdsChange: (ids: string[]) => void
  onProjectChange?: (value: string) => void
  onRangeChange: (from: string, to: string) => void
}

const ALL_PROJECTS = "__all__"

const TASK_STATE_CLASS: Record<StandupTaskState, string> = {
  open: "text-foreground",
  done: "text-muted-foreground line-through",
  tomorrow: "text-task-tomorrow",
  progress: "text-task-progress",
}

function HistoryDayCard({
  day,
  highlightQuery,
  projectId,
}: {
  day: StandupHistoryDay
  highlightQuery: string
  projectId: string
}) {
  const [open, setOpen] = React.useState(true)
  const working = day.records.filter((record) =>
    isWorking(record.attendanceStatus),
  )

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-lg border bg-card"
    >
      <header
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`${open ? "Collapse" : "Expand"} stand-up for ${formatHistoryDay(day.date)}`}
        className="flex w-full cursor-pointer flex-wrap items-center gap-3 px-4 py-3 sm:px-5 hover:bg-muted/40"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            setOpen((value) => !value)
          }
        }}
      >
        <h2 className="flex min-w-0 items-center gap-1.5 text-base font-semibold">
          <IconCalendar className="size-4 shrink-0 text-primary" />
          <Link
            to="/stand-ups/$id"
            params={{ id: day.standupId }}
            className="hover:underline"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {formatHistoryDay(day.date)}
          </Link>
        </h2>
        <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
          <IconUsers className="size-3.5" />
          {working.length} working · {day.records.length - working.length}{" "}
          absent
        </span>
        <IconChevronDown
          aria-hidden
          className={cn(
            "ml-auto size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </header>

      <CollapsibleContent>
        <ul className="divide-y border-t px-4 sm:px-5">
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
              </div>
              <div className="mt-2 space-y-2">
                {record.allocations.map((allocation) => (
                  <div
                    key={allocation.projectId}
                    className="rounded-md bg-muted/40 px-3 py-2"
                  >
                    <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                      <HighlightText
                        text={allocation.projectName}
                        query={highlightQuery}
                      />
                      <IconChevronRight className="size-3" />
                      {allocation.percentage}%
                    </div>
                    {(allocation.tasks ?? []).length > 0 ? (
                      <ul className="mt-1 space-y-0.5">
                        {(allocation.tasks ?? []).map((task) => (
                          <li
                            key={task.id}
                            className={cn(
                              "whitespace-pre-wrap text-sm",
                              TASK_STATE_CLASS[task.state],
                            )}
                          >
                            <HighlightText
                              text={task.text || "(empty)"}
                              query={highlightQuery}
                            />
                            {task.blocker ? (
                              <span className="mt-0.5 block whitespace-pre-wrap text-xs text-task-blocker">
                                Blocked:{" "}
                                <HighlightText
                                  text={task.blocker}
                                  query={highlightQuery}
                                />
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        No tasks
                      </p>
                    )}
                  </div>
                ))}
                {!projectId && record.miscellaneousNotes?.trim() ? (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    <HighlightText
                      text={record.miscellaneousNotes}
                      query={highlightQuery}
                    />
                  </p>
                ) : null}
                {record.allocations.length === 0 &&
                !record.miscellaneousNotes?.trim() ? (
                  <p className="text-sm text-muted-foreground">
                    No tasks recorded.
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

function employeeFilterLabel(
  selectedIds: string[],
  employees: Employee[],
) {
  if (selectedIds.length === 0) return "All employees"
  if (selectedIds.length === 1) {
    const match = employees.find((employee) => employee.id === selectedIds[0])
    return match?.name ?? "1 employee"
  }
  return `${selectedIds.length} employees`
}

function EmployeeMultiFilter({
  employees,
  selectedIds,
  onChange,
}: {
  employees: Employee[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const selected = React.useMemo(() => new Set(selectedIds), [selectedIds])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return employees
    return employees.filter((employee) => {
      const hay = `${employee.name} ${employee.email}`.toLowerCase()
      return hay.includes(q)
    })
  }, [employees, query])

  const toggle = (id: string, checked: boolean) => {
    if (checked) {
      onChange([...selectedIds, id])
      return
    }
    onChange(selectedIds.filter((value) => value !== id))
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery("")
      }}
    >
      <PopoverTrigger
        className={cn(
          buttonVariants({
            variant: "outline",
            className: "w-56 justify-between font-normal",
          }),
        )}
        aria-label="Filter by employees"
      >
        <span className="truncate">
          {employeeFilterLabel(selectedIds, employees)}
        </span>
        <IconChevronDown className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-0 p-0">
        <div className="border-b p-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search employees…"
            aria-label="Search employees"
            className="h-8"
            autoFocus
          />
        </div>
        <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
          <button
            type="button"
            className={cn(
              buttonVariants({
                variant: "ghost",
                size: "sm",
                className: "h-7 px-2 text-xs",
              }),
            )}
            disabled={selectedIds.length === 0}
            onClick={() => onChange([])}
          >
            Clear
          </button>
          <span className="text-xs text-muted-foreground">
            {selectedIds.length === 0
              ? "All employees"
              : `${selectedIds.length} selected`}
          </span>
        </div>
        <div className="max-h-64 space-y-0.5 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              No matching employees
            </p>
          ) : (
            filtered.map((employee) => {
              const checked = selected.has(employee.id)
              return (
                <label
                  key={employee.id}
                  className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) =>
                      toggle(employee.id, Boolean(value))
                    }
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">
                      {employee.status === "left"
                        ? `${employee.name} (left)`
                        : employee.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {employee.email}
                    </span>
                  </span>
                </label>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function StandupHistoryView({
  q,
  employeeIds,
  projectId,
  from,
  to,
  refreshKey = 0,
  hideProjectFilter = false,
  onSearchChange,
  onEmployeeIdsChange,
  onProjectChange,
  onRangeChange,
}: Props) {
  const [searchInput, setSearchInput] = React.useState(q)
  const [employees, setEmployees] = React.useState<Employee[]>([])
  const [projects, setProjects] = React.useState<Project[]>([])
  const [days, setDays] = React.useState<StandupHistoryDay[]>([])
  const [cursor, setCursor] = React.useState<string | null>(null)
  const [hasMore, setHasMore] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const sentinelRef = React.useRef<HTMLDivElement>(null)
  const requestIdRef = React.useRef(0)

  const range = React.useMemo<DateRange>(() => {
    const parsedFrom = parseLocalIsoDate(from)
    const parsedTo = parseLocalIsoDate(to)
    if (parsedFrom && parsedTo) {
      return { from: parsedFrom, to: parsedTo }
    }
    return rangeFromDays(DEFAULT_PRESET_DAYS)
  }, [from, to])
  const activePreset = activePresetFromRange(range)

  React.useEffect(() => {
    setSearchInput(q)
  }, [q])

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchInput !== q) onSearchChange(searchInput)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput, q, onSearchChange])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        if (hideProjectFilter) {
          const empRes = await api<
            PaginatedEnvelope<Employee[]> | Envelope<Employee[]>
          >("/employees")
          if (cancelled) return
          setEmployees(
            [...empRes.data].sort((a, b) => a.name.localeCompare(b.name)),
          )
          setProjects([])
          return
        }
        const [empRes, projRes] = await Promise.all([
          api<PaginatedEnvelope<Employee[]> | Envelope<Employee[]>>("/employees"),
          api<Envelope<Project[]> | PaginatedEnvelope<Project[]>>("/projects"),
        ])
        if (cancelled) return
        setEmployees(
          [...empRes.data].sort((a, b) => a.name.localeCompare(b.name)),
        )
        setProjects(
          [...projRes.data].sort((a, b) => a.name.localeCompare(b.name)),
        )
      } catch {
        if (!cancelled) {
          setEmployees([])
          setProjects([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hideProjectFilter])

  const projectItems = React.useMemo(
    () =>
      Object.fromEntries([
        [ALL_PROJECTS, "All projects"],
        ...projects.map((project) => [project.id, project.name]),
      ]),
    [projects],
  )

  const loadPage = React.useCallback(
    async (opts: { reset: boolean; cursorOverride?: string | null }) => {
      if (!from || !to) return
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
        if (employeeIds.length > 0) {
          params.set("employeeIds", employeeIds.join(","))
        }
        if (projectId.trim()) params.set("projectId", projectId.trim())
        params.set("from", from)
        params.set("to", to)
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
    [q, employeeIds, projectId, from, to, cursor],
  )

  React.useEffect(() => {
    if (!from || !to) return
    setCursor(null)
    void loadPage({ reset: true })
  }, [q, employeeIds, projectId, from, to, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1 max-w-md">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={
              hideProjectFilter
                ? "Search by name, notes, or tasks (fuzzy)…"
                : "Search by name, project, notes, or tasks (fuzzy)…"
            }
            className="pl-9"
            aria-label="Search stand-up history"
          />
        </div>
        <EmployeeMultiFilter
          employees={employees}
          selectedIds={employeeIds}
          onChange={onEmployeeIdsChange}
        />
        {!hideProjectFilter ? (
          <Select
            value={projectId || ALL_PROJECTS}
            onValueChange={(value) => {
              onProjectChange?.(value === ALL_PROJECTS || !value ? "" : value)
            }}
            items={projectItems}
          >
            <SelectTrigger className="w-56" aria-label="Filter by project">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PROJECTS}>All projects</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <DateRangeBar
          range={range}
          activePreset={activePreset}
          onChange={(next) => {
            onRangeChange(toIsoDateInput(next.from), toIsoDateInput(next.to))
          }}
          onPreset={(days) => {
            const next = rangeFromDays(days)
            onRangeChange(toIsoDateInput(next.from), toIsoDateInput(next.to))
          }}
        />
      </div>

      {loading ? <LoadingState label="Loading history…" /> : null}
      {error ? (
        <ErrorState message={error} onRetry={() => void loadPage({ reset: true })} />
      ) : null}

      {!loading && !error && days.length === 0 ? (
        <EmptyState
          message={
            q.trim() || employeeIds.length > 0 || projectId || from || to
              ? "No stand-ups match these filters."
              : "No stand-up history yet."
          }
        />
      ) : null}

      <div className="space-y-4">
        {days.map((day) => (
          <HistoryDayCard
            key={day.standupId}
            day={day}
            highlightQuery={highlightQuery}
            projectId={projectId}
          />
        ))}
      </div>

      <div ref={sentinelRef} className="flex justify-center py-6">
        {loadingMore ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Loading more…
          </div>
        ) : null}
        {!loading && !loadingMore && !error && days.length > 0 && !hasMore ? (
          <p className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="h-px w-8 bg-border" aria-hidden />
            {q.trim()
              ? "You've reached the end — no more matching stand-ups."
              : "You've reached the end — no more stand-ups."}
            <span className="h-px w-8 bg-border" aria-hidden />
          </p>
        ) : null}
      </div>
    </div>
  )
}

import * as React from "react"
import { Link } from "@tanstack/react-router"
import { IconCalendar, IconChevronRight, IconUsers } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states"
import { api, ApiError, type Envelope } from "@/lib/api"
import type { AttendanceStatus, StandupTask, StandupTaskState } from "@/lib/types"
import { format, parseISO } from "date-fns"

type ProjectStandupDay = {
  date: string
  standupId: string
  status: string
  records: Array<{
    id: string
    employee: { id: string; name: string }
    attendanceStatus: AttendanceStatus
    allocations: Array<{
      projectId: string
      projectName: string
      percentage: number
      tasks?: StandupTask[]
    }>
  }>
}

const TASK_STATE_CLASS: Record<StandupTaskState, string> = {
  open: "text-foreground",
  done: "text-muted-foreground line-through",
  tomorrow: "text-task-tomorrow",
  progress: "text-task-progress",
}

const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  first_half_leave: "1st half leave",
  second_half_leave: "2nd half leave",
  absent: "Absent",
}

function formatDay(value: string) {
  try {
    return format(parseISO(String(value).slice(0, 10)), "EEEE, d MMMM yyyy")
  } catch {
    return String(value).slice(0, 10)
  }
}

export function ProjectStandupsTab({ projectId }: { projectId: string }) {
  const [days, setDays] = React.useState<ProjectStandupDay[]>([])
  const [cursor, setCursor] = React.useState<string | null>(null)
  const [hasMore, setHasMore] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(
    async (opts: { reset: boolean }) => {
      if (opts.reset) {
        setLoading(true)
        setError(null)
      } else {
        setLoadingMore(true)
      }
      try {
        const params = new URLSearchParams()
        params.set("limit", "15")
        if (!opts.reset && cursor) params.set("cursor", cursor)
        const res = await api<
          Envelope<ProjectStandupDay[]> & {
            meta: { nextCursor: string | null; hasMore: boolean }
          }
        >(`/projects/${projectId}/standups?${params.toString()}`)
        setDays((prev) => (opts.reset ? res.data : [...prev, ...res.data]))
        setCursor(res.meta.nextCursor)
        setHasMore(res.meta.hasMore)
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load stand-ups")
        if (opts.reset) setDays([])
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [projectId, cursor],
  )

  React.useEffect(() => {
    setCursor(null)
    void load({ reset: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  if (loading) return <LoadingState label="Loading project stand-ups…" />
  if (error) return <ErrorState message={error} onRetry={() => void load({ reset: true })} />
  if (days.length === 0) {
    return (
      <EmptyState message="No stand-up allocations for this project yet." />
    )
  }

  return (
    <div className="space-y-4">
      {days.map((day) => (
        <section key={day.standupId} className="rounded-lg border bg-card p-4">
          <header className="mb-3 flex flex-wrap items-center gap-3 border-b pb-3">
            <h3 className="flex items-center gap-1.5 text-base font-semibold">
              <IconCalendar className="size-4 text-primary" />
              <Link
                to="/stand-ups/$id"
                params={{ id: day.standupId }}
                className="hover:underline"
              >
                {formatDay(day.date)}
              </Link>
            </h3>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <IconUsers className="size-3.5" />
              {day.records.length}{" "}
              {day.records.length === 1 ? "employee" : "employees"}
            </span>
          </header>
          <ul className="space-y-3">
            {day.records.map((record) => (
              <li key={record.id}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{record.employee.name}</span>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                    {ATTENDANCE_LABELS[record.attendanceStatus]}
                  </span>
                  {record.allocations[0] ? (
                    <span className="font-mono text-xs text-muted-foreground">
                      {record.allocations[0].percentage}%
                    </span>
                  ) : null}
                </div>
                {(record.allocations[0]?.tasks ?? []).length > 0 ? (
                  <ul className="mt-1 space-y-0.5 pl-1">
                    {(record.allocations[0]?.tasks ?? []).map((task) => (
                      <li
                        key={task.id}
                        className={cn("text-sm", TASK_STATE_CLASS[task.state])}
                      >
                        {task.text || "(empty)"}
                        {task.blocker ? (
                          <span className="mt-0.5 block text-xs text-task-blocker">
                            Blocked: {task.blocker}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">No tasks</p>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <Link
              to="/stand-ups/$id"
              params={{ id: day.standupId }}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Open stand-up <IconChevronRight className="size-3" />
            </Link>
          </div>
        </section>
      ))}
      {hasMore ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={() => void load({ reset: false })}
          >
            {loadingMore ? (
              <>
                <Spinner className="size-3.5" /> Loading…
              </>
            ) : (
              "Load more"
            )}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

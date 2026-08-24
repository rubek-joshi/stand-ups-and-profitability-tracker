import * as React from "react"
import { IconCalendar, IconLayoutGrid, IconTable } from "@tabler/icons-react"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"
import type {
  AttendanceStatus,
  StandupLayoutPreference,
  StandupProjectAccentPreference,
} from "@/lib/types"
import {
  ATTENDANCE_META,
  ATTENDANCE_OPTIONS,
  resolveProjectAccent,
} from "./entry-draft"

const PREVIEW_WIDTH = 920
const PREVIEW_MAX_HEIGHT = 280

const PROJECTS = [
  { id: "atlas", name: "Atlas", themeColor: "#168A6F" },
  { id: "helios", name: "Helios", themeColor: "#4F7CFF" },
  { id: "nimbus", name: "Nimbus", themeColor: "#C45C26" },
] as const

type PreviewTask = { text: string; state: "open" | "done" | "progress" }

type PreviewAllocation = {
  projectId: (typeof PROJECTS)[number]["id"]
  percentage: number
  tasks: PreviewTask[]
}

type PreviewEntry = {
  name: string
  email: string
  attendanceStatus: AttendanceStatus
  allocations: PreviewAllocation[]
}

const ENTRIES: PreviewEntry[] = [
  {
    name: "Asha Rai",
    email: "asha@ottr.dev",
    attendanceStatus: "present",
    allocations: [
      {
        projectId: "atlas",
        percentage: 60,
        tasks: [
          { text: "Ship invoice export", state: "done" },
          { text: "Review payroll mapping", state: "open" },
        ],
      },
      {
        projectId: "helios",
        percentage: 40,
        tasks: [{ text: "Fix stand-up sync", state: "progress" }],
      },
    ],
  },
  {
    name: "Binod Thapa",
    email: "binod@ottr.dev",
    attendanceStatus: "late",
    allocations: [
      {
        projectId: "nimbus",
        percentage: 100,
        tasks: [{ text: "Draft AMC renewal notes", state: "open" }],
      },
    ],
  },
  {
    name: "Maya Gurung",
    email: "maya@ottr.dev",
    attendanceStatus: "absent",
    allocations: [],
  },
]

const STATUS_PILL: Record<AttendanceStatus, string> = {
  present: "bg-primary text-primary-foreground",
  late: "bg-orange-600/90 text-secondary-foreground",
  first_half_leave: "bg-amber-600/90 text-secondary-foreground",
  second_half_leave: "bg-amber-600/90 text-secondary-foreground",
  absent: "bg-destructive text-destructive-foreground",
}

function accentColor(
  projectId: string,
  preference: StandupProjectAccentPreference,
  surface: "dot" | "bar",
) {
  const project = PROJECTS.find((item) => item.id === projectId)
  return resolveProjectAccent(project?.themeColor, preference, surface)
}

function projectName(projectId: string) {
  return PROJECTS.find((item) => item.id === projectId)?.name ?? projectId
}

function StatusPills({ value }: { value: AttendanceStatus }) {
  return (
    <div className="flex flex-wrap gap-1">
      {ATTENDANCE_OPTIONS.map((option) => (
        <span
          key={option.value}
          className={cn(
            "min-w-9 rounded-md border px-2 py-1 text-center text-xs font-medium",
            value === option.value
              ? STATUS_PILL[option.value]
              : "border-border bg-background text-muted-foreground",
          )}
        >
          {option.label}
        </span>
      ))}
    </div>
  )
}

function AllocationMini({
  allocations,
  accent,
  faded,
}: {
  allocations: PreviewAllocation[]
  accent: StandupProjectAccentPreference
  faded?: boolean
}) {
  if (allocations.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No projects allocated. Add at least one if status is Present.
      </p>
    )
  }
  return (
    <div className={cn("flex flex-col gap-3", faded && "opacity-45")}>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
        {allocations.map((allocation) => (
          <div
            key={allocation.projectId}
            className="h-full transition-[width,background-color]"
            style={{
              width: `${allocation.percentage}%`,
              backgroundColor: accentColor(
                allocation.projectId,
                accent,
                "bar",
              ),
            }}
          />
        ))}
      </div>
      {allocations.map((allocation) => (
        <div key={allocation.projectId} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{
                backgroundColor: accentColor(
                  allocation.projectId,
                  accent,
                  "dot",
                ),
              }}
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {projectName(allocation.projectId)}
            </span>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {allocation.percentage}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted pl-4">
            <div
              className="h-full rounded-full bg-foreground/25"
              style={{ width: `${allocation.percentage}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function TaskMini({
  allocations,
  accent,
  faded,
}: {
  allocations: PreviewAllocation[]
  accent: StandupProjectAccentPreference
  faded?: boolean
}) {
  if (allocations.length === 0) {
    return (
      <p className="px-1 py-1.5 text-sm text-muted-foreground/70">
        Pick a project to start writing tasks
      </p>
    )
  }
  return (
    <div className={cn("flex flex-col gap-5", faded && "opacity-45")}>
      {allocations.map((allocation) => (
        <section key={allocation.projectId}>
          <div className="mb-1 flex items-center gap-2 border-b pb-1">
            <span
              className="size-2 rounded-full"
              style={{
                backgroundColor: accentColor(
                  allocation.projectId,
                  accent,
                  "dot",
                ),
              }}
            />
            <h3 className="text-sm font-semibold text-foreground">
              {projectName(allocation.projectId)}
            </h3>
            <span className="font-mono text-xs text-muted-foreground">
              {allocation.percentage}%
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            {allocation.tasks.map((task) => (
              <div key={task.text} className="flex items-start gap-2 px-2 py-1">
                <span
                  className={cn(
                    "mt-[0.45rem] size-1.5 shrink-0 rounded-full",
                    task.state === "open" && "bg-muted-foreground/50",
                    task.state === "done" && "bg-muted-foreground/30",
                    task.state === "progress" && "bg-task-progress",
                  )}
                />
                <span
                  className={cn(
                    "text-sm leading-snug",
                    task.state === "done" &&
                      "text-muted-foreground line-through",
                  )}
                >
                  {task.text}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function CardPreview({
  accent,
}: {
  accent: StandupProjectAccentPreference
}) {
  return (
    <div className="flex flex-col gap-5">
      {ENTRIES.map((entry) => {
        const meta = ATTENDANCE_META[entry.attendanceStatus]
        const faded = entry.attendanceStatus === "absent"
        return (
          <article
            key={entry.email}
            className={cn(
              "overflow-hidden rounded-xl border border-border bg-card",
              faded && "opacity-80",
            )}
          >
            <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-secondary/40 px-5 py-3">
              <div className="flex items-center gap-3">
                <span className={cn("size-2.5 rounded-full", meta.colorClass)} />
                <div>
                  <p className="text-lg leading-tight font-semibold text-foreground">
                    {entry.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.email} · {meta.label}
                  </p>
                </div>
              </div>
              <StatusPills value={entry.attendanceStatus} />
            </header>
            <div className="grid md:grid-cols-[minmax(16rem,20rem)_1fr]">
              <aside className="border-b bg-secondary/20 p-4 md:border-b-0 md:border-r">
                <AllocationMini
                  allocations={entry.allocations}
                  accent={accent}
                  faded={faded}
                />
              </aside>
              <div className="p-5">
                <TaskMini
                  allocations={entry.allocations}
                  accent={accent}
                  faded={faded}
                />
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function TablePreview({
  accent,
}: {
  accent: StandupProjectAccentPreference
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-secondary/60 text-[0.7rem] tracking-widest text-muted-foreground uppercase">
            <th className="w-48 px-4 py-3 font-medium">Employee</th>
            <th className="w-44 px-4 py-3 font-medium">Status</th>
            <th className="w-52 px-3 py-3 font-medium">Projects</th>
            <th className="px-4 py-3 font-medium">Project tasks</th>
          </tr>
        </thead>
        <tbody>
          {ENTRIES.map((entry) => {
            const faded = entry.attendanceStatus === "absent"
            const meta = ATTENDANCE_META[entry.attendanceStatus]
            return (
              <tr
                key={entry.email}
                className="border-t-2 border-border align-top"
              >
                <td className="border-r px-4 py-3">
                  <p className="text-base leading-tight font-semibold text-foreground">
                    {entry.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {entry.email}
                  </p>
                </td>
                <td className="border-r px-4 py-3">
                  <div className="flex h-8 w-44 items-center rounded-lg border border-input bg-background px-3 text-sm">
                    {meta.label}
                  </div>
                </td>
                <td className="w-52 max-w-56 border-r px-3 py-3">
                  <AllocationMini
                    allocations={entry.allocations}
                    accent={accent}
                    faded={faded}
                  />
                </td>
                <td className="px-3 py-3">
                  <TaskMini
                    allocations={entry.allocations}
                    accent={accent}
                    faded={faded}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function StandupLayoutPreview({
  layout,
  accent,
}: {
  layout: StandupLayoutPreference
  accent: StandupProjectAccentPreference
}) {
  const frameRef = React.useRef<HTMLDivElement>(null)
  const [scale, setScale] = React.useState(0.32)

  React.useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const update = () => {
      const next = frame.clientWidth / PREVIEW_WIDTH
      setScale(Number.isFinite(next) && next > 0 ? next : 0.32)
    }
    const observer = new ResizeObserver(update)
    observer.observe(frame)
    update()
    return () => observer.disconnect()
  }, [])

  const layoutLabel = layout === "card" ? "Card view" : "Table view"
  const accentLabel =
    accent === "off" ? "dots only" : accent === "on" ? "full colors" : "soft hues"

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={frameRef}
        role="img"
        aria-label={`Stand-up preview, ${layoutLabel}, project accents ${accentLabel}`}
        className="relative overflow-hidden rounded-lg border bg-background"
        style={{ height: PREVIEW_MAX_HEIGHT }}
      >
        <div
          aria-hidden
          className="pointer-events-none origin-top-left select-none"
          style={{
            width: PREVIEW_WIDTH,
            transform: `scale(${scale})`,
          }}
        >
          <div className="bg-background p-4">
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border bg-card/95 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <IconCalendar className="size-3.5" />
                  Wednesday, 19 August 2026
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge>Live</Badge>
                  <span>Sample stand-up</span>
                </div>
              </div>
              <div className="flex gap-1">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs",
                    layout === "card"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground",
                  )}
                >
                  <IconLayoutGrid className="size-3.5" />
                  Cards
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs",
                    layout === "table"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground",
                  )}
                >
                  <IconTable className="size-3.5" />
                  Table
                </span>
              </div>
            </div>
            {layout === "card" ? (
              <CardPreview accent={accent} />
            ) : (
              <TablePreview accent={accent} />
            )}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-background to-transparent" />
      </div>
      <p className="text-xs text-muted-foreground">
        Dummy data · {layoutLabel} · {accentLabel}
      </p>
    </div>
  )
}

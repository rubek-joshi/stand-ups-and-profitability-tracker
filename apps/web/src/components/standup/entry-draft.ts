import type { AttendanceStatus, Project, StandupEntry } from "@/lib/types"
import { type DraftAlloc } from "./project-allocations"
import { tasksFromApi, type TaskDraft } from "./task-editor"

export type AllocationDraft = DraftAlloc & { tasks: TaskDraft[] }

export type EntryDraft = {
  attendanceStatus: AttendanceStatus
  miscellaneousNotes: string
  allocations: AllocationDraft[]
}

export const ATTENDANCE_OPTIONS: Array<{
  value: AttendanceStatus
  label: string
  short: string
}> = [
  { value: "present", label: "Present", short: "P" },
  { value: "late", label: "Late", short: "L" },
  { value: "first_half_leave", label: "1st half leave", short: "1HL" },
  { value: "second_half_leave", label: "2nd half leave", short: "2HL" },
  { value: "absent", label: "Absent", short: "A" },
]

export const ATTENDANCE_META: Record<
  AttendanceStatus,
  { label: string; colorClass: string }
> = {
  present: { label: "Present", colorClass: "bg-primary" },
  late: { label: "Late", colorClass: "bg-orange-500" },
  first_half_leave: { label: "1st half leave", colorClass: "bg-amber-500" },
  second_half_leave: { label: "2nd half leave", colorClass: "bg-amber-600" },
  absent: { label: "Absent", colorClass: "bg-destructive" },
}

export function isWorking(status: AttendanceStatus) {
  return status !== "absent"
}

export function isEntryComplete(draft: EntryDraft) {
  if (!isWorking(draft.attendanceStatus)) return true
  const hasTasks = draft.allocations.some((a) =>
    a.tasks.some((t) => t.text.trim().length > 0),
  )
  return hasTasks || draft.miscellaneousNotes.trim().length > 0
}

export function draftsFromStandup(
  entries: StandupEntry[] | undefined,
): Record<string, EntryDraft> {
  const next: Record<string, EntryDraft> = {}
  for (const entry of entries ?? []) {
    next[entry.id] = {
      attendanceStatus: entry.attendanceStatus,
      miscellaneousNotes: entry.miscellaneousNotes ?? "",
      allocations: (entry.allocations ?? []).map((a) => ({
        projectId: a.projectId,
        percentage: a.percentage,
        isNonBillable: a.isNonBillable,
        locked: false,
        tasks: tasksFromApi(a.tasks),
      })),
    }
  }
  return next
}

export function serializeDrafts(drafts: Record<string, EntryDraft>): string {
  const ids = Object.keys(drafts).sort()
  return JSON.stringify(
    ids.map((id) => {
      const d = drafts[id]!
      return {
        id,
        attendanceStatus: d.attendanceStatus,
        miscellaneousNotes: d.miscellaneousNotes,
        allocations: d.allocations
          .filter((a) => a.projectId)
          .map((a) => ({
            projectId: a.projectId,
            percentage: Number(a.percentage),
            isNonBillable: Boolean(a.isNonBillable),
            tasks: a.tasks.map((t, i) => ({
              id: t.id,
              text: t.text,
              state: t.state,
              blocker: t.blocker,
              sortOrder: i,
            })),
          })),
      }
    }),
  )
}

export function buildEntriesPayload(
  entries: StandupEntry[] | undefined,
  drafts: Record<string, EntryDraft>,
  employeeIds?: Set<string> | null,
) {
  const scoped = (entries ?? []).filter((entry) =>
    employeeIds ? employeeIds.has(entry.employee.id) : true,
  )
  return scoped.map((entry) => {
    const d = drafts[entry.id]
    if (!d || d.attendanceStatus === "absent") {
      return {
        id: entry.id,
        attendanceStatus: (d?.attendanceStatus ?? entry.attendanceStatus) as AttendanceStatus,
        miscellaneousNotes: null,
        allocations: [],
      }
    }
    return {
      id: entry.id,
      attendanceStatus: d.attendanceStatus,
      miscellaneousNotes: d.miscellaneousNotes,
      allocations: d.allocations
        .filter((a) => a.projectId)
        .map((a) => ({
          projectId: a.projectId,
          percentage: Number(a.percentage),
          isNonBillable: Boolean(a.isNonBillable),
          tasks: a.tasks
            .filter(
              (t) =>
                t.text.trim().length > 0 ||
                t.blocker ||
                t.state !== "open",
            )
            .map((t, taskIndex) => ({
              id: t.id,
              text: t.text,
              state: t.state,
              blocker: t.blocker,
              sortOrder: taskIndex,
            })),
        })),
    }
  })
}

export function withPreservedTasks(
  previous: AllocationDraft[],
  next: DraftAlloc[],
): AllocationDraft[] {
  return next.map((allocation) => {
    const prior = previous.find((item) => item.projectId === allocation.projectId)
    return {
      ...allocation,
      tasks: prior?.tasks ?? [],
    }
  })
}

/** App primary teal as hex — default project accent for stand-ups. */
export const DEFAULT_PROJECT_THEME_COLOR = "#168A6F"

export function projectColor(projectId: string, projects: Project[]) {
  const project = projects.find((p) => p.id === projectId)
  return project?.themeColor?.trim() || DEFAULT_PROJECT_THEME_COLOR
}

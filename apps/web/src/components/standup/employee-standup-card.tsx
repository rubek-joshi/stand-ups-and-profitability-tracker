import {
  IconCircleCheck,
  IconCircleDashed,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"
import type { AttendanceStatus, Project, StandupEntry } from "@/lib/types"
import { MarkdownNotes } from "./markdown-notes"
import {
  ProjectAllocations,
  totalPercent,
  type DraftAlloc,
} from "./project-allocations"

export type EntryDraft = {
  attendanceStatus: AttendanceStatus
  notesMarkdown: string
  allocations: DraftAlloc[]
}

const ATTENDANCE_OPTIONS: Array<{
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

const statusActive: Record<AttendanceStatus, string> = {
  present: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
  late: "bg-orange-600/90 text-secondary-foreground hover:bg-secondary",
  first_half_leave: "bg-amber-600/90 text-secondary-foreground hover:bg-secondary",
  second_half_leave: "bg-amber-600/90 text-secondary-foreground hover:bg-secondary",
  absent: "bg-destructive text-destructive-foreground hover:bg-destructive hover:text-destructive-foreground",
}

export function isWorking(status: AttendanceStatus) {
  return status !== "absent"
}

export function isEntryComplete(draft: EntryDraft) {
  if (!isWorking(draft.attendanceStatus)) return true
  return (
    draft.notesMarkdown.trim().length > 0 &&
    totalPercent(draft.allocations) === 100
  )
}

type Props = {
  entry: StandupEntry
  draft: EntryDraft
  projects: Project[]
  readonly?: boolean
  saving?: boolean
  onChange: (draft: EntryDraft) => void
  onNotesChange: (notes: string) => void
  onSave: () => void
}

export function EmployeeStandupCard({
  entry,
  draft,
  projects,
  readonly,
  saving,
  onChange,
  onNotesChange,
  onSave,
}: Props) {
  const working = isWorking(draft.attendanceStatus)
  const complete = isEntryComplete(draft)
  const initials = entry.employee.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <Card className={cn(!working && "bg-muted/30")}>
      <CardContent className="p-4 sm:p-5">
        <header className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-xl text-sm font-semibold",
              working
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold">{entry.employee.name}</h3>
            <p className="truncate text-xs text-muted-foreground">
              {entry.employee.email}
            </p>
          </div>

          {complete ? (
            <IconCircleCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <IconCircleDashed className="size-4 shrink-0 text-muted-foreground" />
          )}

          <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
            {ATTENDANCE_OPTIONS.map((option) => {
              const active = draft.attendanceStatus === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={readonly}
                  onClick={() => {
                    const status = option.value
                    onChange({
                      ...draft,
                      attendanceStatus: status,
                      allocations: status === "absent" ? [] : draft.allocations,
                      notesMarkdown: status === "absent" ? "" : draft.notesMarkdown,
                    })
                  }}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
                    active && statusActive[option.value],
                  )}
                >
                  <span className="hidden sm:inline">{option.label}</span>
                  <span className="font-mono sm:hidden">{option.short}</span>
                </button>
              )
            })}
          </div>

          {!readonly ? (
            <Button
              size="sm"
              disabled={saving}
              onClick={onSave}
              className="shrink-0"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          ) : null}
        </header>

        {working ? (
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <MarkdownNotes
              value={draft.notesMarkdown}
              disabled={readonly}
              onChange={onNotesChange}
            />
            <ProjectAllocations
              allocations={draft.allocations}
              projects={projects}
              disabled={readonly}
              onChange={(allocations) => onChange({ ...draft, allocations })}
            />
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
            Marked absent — notes and project allocation are disabled for this stand-up.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

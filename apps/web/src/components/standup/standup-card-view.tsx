import { cn } from "@workspace/ui/lib/utils"
import type { AttendanceStatus, Project, StandupEntry } from "@/lib/types"
import { useAuth } from "@/lib/auth"
import {
  ATTENDANCE_META,
  isWorking,
  projectColor,
  withPreservedTasks,
  type EntryDraft,
} from "./entry-draft"
import { MiscellaneousNotesToggle } from "./miscellaneous-notes-toggle"
import { ProjectAllocations } from "./project-allocations"
import { StatusSelect } from "./standup-controls"
import { TaskEditor, type TaskDraft } from "./task-editor"

type Props = {
  entries: StandupEntry[]
  drafts: Record<string, EntryDraft>
  projects: Project[]
  readonly?: boolean
  onDraftChange: (entryId: string, draft: EntryDraft) => void
}

export function StandupCardView({
  entries,
  drafts,
  projects,
  readonly,
  onDraftChange,
}: Props) {
  const { user } = useAuth()
  const accentPreference = user?.standupProjectAccentPreference ?? "muted"
  return (
    <div className="space-y-5">
      {entries.map((entry) => {
        const draft = drafts[entry.id]
        if (!draft) return null
        const disabled = readonly || !isWorking(draft.attendanceStatus)
        const meta = ATTENDANCE_META[draft.attendanceStatus]
        return (
          <article
            key={entry.id}
            data-standup-entry={entry.id}
            className={cn(
              "overflow-hidden rounded-xl border border-border bg-card transition-opacity",
              disabled && !readonly && "opacity-80",
            )}
          >
            <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-secondary/40 px-5 py-3">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={cn("size-2.5 rounded-full", meta.colorClass)}
                />
                <div>
                  <h2 className="text-lg leading-tight font-semibold text-foreground">
                    {entry.employee.name}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {entry.employee.email} · {meta.label}
                  </p>
                </div>
              </div>
              <StatusSelect
                value={draft.attendanceStatus}
                disabled={readonly}
                onChange={(status: AttendanceStatus) =>
                  onDraftChange(entry.id, {
                    ...draft,
                    attendanceStatus: status,
                  })
                }
              />
            </header>

            <div className="grid gap-0 md:grid-cols-[minmax(16rem,20rem)_1fr]">
              <aside className="border-b bg-secondary/20 p-4 md:border-b-0 md:border-r">
                <div className="space-y-4 md:sticky md:top-24">
                  <ProjectAllocations
                    allocations={draft.allocations}
                    projects={projects}
                    disabled={disabled}
                    onChange={(next) =>
                      onDraftChange(entry.id, {
                        ...draft,
                        allocations: withPreservedTasks(draft.allocations, next),
                      })
                    }
                  />
                </div>
              </aside>

              <div className="max-h-[32rem] space-y-6 overflow-y-auto p-5">
                {draft.allocations.map((a) => {
                  const project = projects.find((p) => p.id === a.projectId)
                  return (
                    <section key={a.projectId} data-standup-project={a.projectId}>
                      <div className="mb-1 flex items-center gap-2 border-b pb-1">
                        <span
                          className="size-2 rounded-full"
                          style={{
                            backgroundColor: projectColor(
                              a.projectId,
                              projects,
                              accentPreference,
                            ),
                          }}
                          aria-hidden
                        />
                        <h3 className="text-sm font-semibold text-foreground">
                          {project?.name ?? a.projectId}
                        </h3>
                        <span className="font-mono text-xs text-muted-foreground">
                          {a.percentage}%
                        </span>
                      </div>
                      <TaskEditor
                        tasks={a.tasks}
                        disabled={disabled}
                        onChange={(tasks: TaskDraft[]) =>
                          onDraftChange(entry.id, {
                            ...draft,
                            allocations: draft.allocations.map((item) =>
                              item.projectId === a.projectId
                                ? { ...item, tasks }
                                : item,
                            ),
                          })
                        }
                      />
                    </section>
                  )
                })}

                <MiscellaneousNotesToggle
                  entryId={entry.id}
                  value={draft.miscellaneousNotes}
                  disabled={disabled}
                  onChange={(miscellaneousNotes) =>
                    onDraftChange(entry.id, { ...draft, miscellaneousNotes })
                  }
                />
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

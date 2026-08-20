import { cn } from "@workspace/ui/lib/utils"
import type { AttendanceStatus, Project, StandupEntry } from "@/lib/types"
import {
  ATTENDANCE_META,
  isWorking,
  projectColor,
  withPreservedTasks,
  type EntryDraft,
} from "./entry-draft"
import { MiscellaneousNotesToggle } from "./miscellaneous-notes-toggle"
import { ProjectAllocations } from "./project-allocations"
import { StatusDropdown } from "./standup-controls"
import { TaskEditor, type TaskDraft } from "./task-editor"

type Props = {
  entries: StandupEntry[]
  drafts: Record<string, EntryDraft>
  projects: Project[]
  readonly?: boolean
  onDraftChange: (entryId: string, draft: EntryDraft) => void
}

export function StandupTableView({
  entries,
  drafts,
  projects,
  readonly,
  onDraftChange,
}: Props) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[48rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-secondary/60 text-[0.7rem] uppercase tracking-widest text-muted-foreground">
            <th className="w-48 px-4 py-3 font-medium">Employee</th>
            <th className="w-44 px-4 py-3 font-medium">Status</th>
            <th className="w-52 px-3 py-3 font-medium">Projects</th>
            <th className="px-4 py-3 font-medium">Project tasks</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const draft = drafts[entry.id]
            if (!draft) return null
            const disabled = readonly || !isWorking(draft.attendanceStatus)
            const meta = ATTENDANCE_META[draft.attendanceStatus]
            return (
              <tr
                key={entry.id}
                data-standup-entry={entry.id}
                className="align-top border-t-2 border-border"
              >
                <td className="border-r px-4 py-3">
                  <p className="text-base leading-tight font-semibold text-foreground">
                    {entry.employee.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {entry.employee.email}
                  </p>
                  {disabled && !readonly && (
                    <span
                      className={cn(
                        "mt-2 inline-block rounded-full px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-background",
                        meta.colorClass,
                      )}
                    >
                      {meta.label}
                    </span>
                  )}
                </td>
                <td className="border-r px-4 py-3">
                  <StatusDropdown
                    value={draft.attendanceStatus}
                    disabled={readonly}
                    onChange={(status: AttendanceStatus) =>
                      onDraftChange(entry.id, {
                        ...draft,
                        attendanceStatus: status,
                      })
                    }
                  />
                </td>
                <td className="w-52 max-w-56 border-r px-3 py-3">
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
                </td>
                <td className="space-y-4 px-3 py-3">
                  {draft.allocations.length === 0 ? (
                    <p className="px-1 py-1.5 text-sm text-muted-foreground/70">
                      Pick a project to start writing tasks
                    </p>
                  ) : (
                    draft.allocations.map((a) => {
                      const project = projects.find((p) => p.id === a.projectId)
                      return (
                        <section key={a.projectId} data-standup-project={a.projectId}>
                          <div className="mb-1 flex items-center gap-2 border-b pb-1">
                            <span
                              className="size-2 rounded-full"
                              style={{
                                backgroundColor: projectColor(a.projectId, projects),
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
                    })
                  )}
                  <MiscellaneousNotesToggle
                    entryId={entry.id}
                    value={draft.miscellaneousNotes}
                    disabled={disabled}
                    onChange={(miscellaneousNotes) =>
                      onDraftChange(entry.id, { ...draft, miscellaneousNotes })
                    }
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

import { DragDropProvider } from "@dnd-kit/react"
import { useSortable } from "@dnd-kit/react/sortable"
import { IconGripVertical } from "@tabler/icons-react"
import { cn } from "@workspace/ui/lib/utils"
import type { AttendanceStatus, Project, StandupEntry } from "@/lib/types"
import { useAuth } from "@/lib/auth"
import {
  ATTENDANCE_META,
  formatStandupProjectName,
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
  disabledReorder?: boolean
  onDraftChange: (entryId: string, draft: EntryDraft) => void
  onReorder?: (fromIndex: number, toIndex: number) => void
}

function SortableTableRow({
  entry,
  index,
  draft,
  projects,
  readonly,
  disabledReorder,
  accentPreference,
  onDraftChange,
}: {
  entry: StandupEntry
  index: number
  draft: EntryDraft
  projects: Project[]
  readonly?: boolean
  disabledReorder?: boolean
  accentPreference: "off" | "muted" | "on"
  onDraftChange: (entryId: string, draft: EntryDraft) => void
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: entry.id,
    index,
    disabled: readonly || disabledReorder,
  })

  const disabled = readonly || !isWorking(draft.attendanceStatus)
  const meta = ATTENDANCE_META[draft.attendanceStatus]

  return (
    <tr
      ref={ref}
      data-standup-entry={entry.id}
      className={cn(
        "border-t-2 border-border align-top",
        isDragging && "opacity-40 bg-muted/40",
      )}
    >
      {!readonly && !disabledReorder ? (
        <td className="w-8 border-r px-2 py-3 text-center align-middle">
          <button
            type="button"
            ref={handleRef}
            className="inline-flex cursor-grab items-center justify-center rounded p-1 text-muted-foreground/60 transition-colors hover:text-foreground active:cursor-grabbing touch-none"
            title="Drag to reorder employee"
            aria-label={`Drag to reorder ${entry.employee.name}`}
          >
            <IconGripVertical className="size-4" />
          </button>
        </td>
      ) : null}
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
              "mt-2 inline-block rounded-full px-2 py-0.5 text-[0.65rem] font-medium tracking-wide text-background uppercase",
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
                      backgroundColor: projectColor(
                        a.projectId,
                        projects,
                        accentPreference,
                      ),
                    }}
                    aria-hidden
                  />
                  <h3 className="text-sm font-semibold text-foreground">
                    {project ? formatStandupProjectName(project) : a.projectId}
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
}

export function StandupTableView({
  entries,
  drafts,
  projects,
  readonly,
  disabledReorder,
  onDraftChange,
  onReorder,
}: Props) {
  const { user } = useAuth()
  const accentPreference = user?.standupProjectAccentPreference ?? "muted"

  return (
    <DragDropProvider
      onDragEnd={(event) => {
        if (event.canceled) return
        const { source, target } = event.operation
        if (!source || !target || source.id === target.id) return
        const fromIndex = entries.findIndex((e) => e.id === source.id)
        const toIndex = entries.findIndex((e) => e.id === target.id)
        if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
          onReorder?.(fromIndex, toIndex)
        }
      }}
    >
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-3xl border-collapse text-left">
          <thead>
            <tr className="border-b border-border bg-secondary/60 text-[0.7rem] tracking-widest text-muted-foreground uppercase">
              {!readonly && !disabledReorder ? (
                <th className="w-8 px-2 py-3" aria-label="Reorder" />
              ) : null}
              <th className="w-48 px-4 py-3 font-medium">Employee</th>
              <th className="w-44 px-4 py-3 font-medium">Status</th>
              <th className="w-52 px-3 py-3 font-medium">Projects</th>
              <th className="px-4 py-3 font-medium">Project tasks</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => {
              const draft = drafts[entry.id]
              if (!draft) return null
              return (
                <SortableTableRow
                  key={entry.id}
                  entry={entry}
                  index={index}
                  draft={draft}
                  projects={projects}
                  readonly={readonly}
                  disabledReorder={disabledReorder}
                  accentPreference={accentPreference}
                  onDraftChange={onDraftChange}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </DragDropProvider>
  )
}

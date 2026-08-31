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

function SortableCardItem({
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
    <article
      ref={ref}
      data-standup-entry={entry.id}
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card transition-opacity",
        disabled && !readonly && "opacity-80",
        isDragging && "opacity-40 shadow-lg ring-2 ring-primary/40",
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-secondary/40 px-5 py-3">
        <div className="flex items-center gap-2.5">
          {!readonly && !disabledReorder ? (
            <button
              type="button"
              ref={handleRef}
              className="-ml-1 inline-flex cursor-grab items-center justify-center rounded p-1 text-muted-foreground/60 transition-colors hover:text-foreground active:cursor-grabbing touch-none"
              title="Drag to reorder employee"
              aria-label={`Drag to reorder ${entry.employee.name}`}
            >
              <IconGripVertical className="size-4" />
            </button>
          ) : null}
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

        <div className="max-h-128 space-y-6 overflow-y-auto p-5">
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
}

export function StandupCardView({
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
      <div className="space-y-5">
        {entries.map((entry, index) => {
          const draft = drafts[entry.id]
          if (!draft) return null
          return (
            <SortableCardItem
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
      </div>
    </DragDropProvider>
  )
}
